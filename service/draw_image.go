package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/google/uuid"
)

const (
	drawImageRetention       = 24 * time.Hour
	drawImageCleanupInterval = time.Hour
	drawImageCleanupBatch    = 100
	drawImageHistoryLimit    = 100
	maxPersistedDrawImage    = 25 << 20
)

type drawImageResponseItem struct {
	URL           string `json:"url,omitempty"`
	B64JSON       string `json:"b64_json,omitempty"`
	RevisedPrompt string `json:"revised_prompt,omitempty"`
}

type DrawHistoryImage struct {
	ID  string `json:"id"`
	Src string `json:"src"`
}

type DrawHistoryRecord struct {
	ID        string             `json:"id"`
	Prompt    string             `json:"prompt"`
	Model     string             `json:"model"`
	CreatedAt int64              `json:"created_at"`
	ExpiresAt int64              `json:"expires_at"`
	Images    []DrawHistoryImage `json:"images"`
}

func drawImageRoot() string {
	if configured := strings.TrimSpace(os.Getenv("DRAW_IMAGE_DIR")); configured != "" {
		return filepath.Clean(configured)
	}
	return filepath.Join("data", "draw-images")
}

func writePersistedDrawImage(userID int, generationID string, source io.Reader) (*model.DrawImage, error) {
	imageID := uuid.NewString()
	dir := filepath.Join(drawImageRoot(), strconv.Itoa(userID), generationID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}

	tempFile, err := os.CreateTemp(dir, ".pending-*")
	if err != nil {
		return nil, err
	}
	tempPath := tempFile.Name()
	defer func() {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
	}()

	written, err := io.Copy(tempFile, io.LimitReader(source, maxPersistedDrawImage+1))
	if err != nil {
		return nil, err
	}
	if written == 0 || written > maxPersistedDrawImage {
		return nil, fmt.Errorf("generated image size is outside the allowed range")
	}
	if _, err := tempFile.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	header := make([]byte, 512)
	headerSize, readErr := tempFile.Read(header)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return nil, readErr
	}
	mimeType := http.DetectContentType(header[:headerSize])
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, fmt.Errorf("generated file is not an image")
	}

	extension := ".img"
	if extensions, _ := mime.ExtensionsByType(mimeType); len(extensions) > 0 {
		extension = extensions[0]
	}
	finalPath := filepath.Join(dir, imageID+extension)
	if err := tempFile.Close(); err != nil {
		return nil, err
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		return nil, err
	}
	tempPath = ""

	now := time.Now().Unix()
	return &model.DrawImage{
		ID:           imageID,
		GenerationID: generationID,
		UserID:       userID,
		Path:         finalPath,
		MIMEType:     mimeType,
		CreatedAt:    now,
		ExpiresAt:    now + int64(drawImageRetention/time.Second),
	}, nil
}

func persistRemoteDrawImage(ctx context.Context, userID int, generationID, rawURL string) (*model.DrawImage, error) {
	if err := ValidateSSRFProtectedFetchURL(rawURL); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	response, err := GetSSRFProtectedHTTPClient().Do(request)
	if err != nil {
		return nil, err
	}
	defer CloseResponseBodyGracefully(response)
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("generated image download returned HTTP %d", response.StatusCode)
	}
	return writePersistedDrawImage(userID, generationID, response.Body)
}

func PersistDrawGenerationResponse(ctx context.Context, userID int, prompt, modelName string, responseBody []byte) ([]byte, error) {
	var response map[string]json.RawMessage
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return nil, err
	}
	var items []drawImageResponseItem
	if err := common.Unmarshal(response["data"], &items); err != nil {
		return nil, err
	}

	generationID := uuid.NewString()
	createdAt := time.Now().Unix()
	expiresAt := createdAt + int64(drawImageRetention/time.Second)
	savedItems := make([]drawImageResponseItem, 0, len(items))
	images := make([]model.DrawImage, 0, len(items))
	for _, item := range items {
		var image *model.DrawImage
		var err error
		switch {
		case item.B64JSON != "":
			decoder := base64.NewDecoder(base64.StdEncoding, strings.NewReader(item.B64JSON))
			image, err = writePersistedDrawImage(userID, generationID, decoder)
		case item.URL != "":
			image, err = persistRemoteDrawImage(ctx, userID, generationID, item.URL)
		default:
			err = errors.New("generated image response has no image data")
		}
		if err != nil {
			common.SysError("failed to persist generated image: " + err.Error())
			continue
		}
		image.CreatedAt = createdAt
		image.ExpiresAt = expiresAt
		images = append(images, *image)
		savedItems = append(savedItems, drawImageResponseItem{
			URL:           "/api/draw/images/" + image.ID,
			RevisedPrompt: item.RevisedPrompt,
		})
	}
	if len(images) == 0 {
		return nil, errors.New("no generated images could be persisted")
	}

	generation := model.DrawGeneration{
		ID:        generationID,
		UserID:    userID,
		Prompt:    prompt,
		Model:     modelName,
		CreatedAt: createdAt,
		ExpiresAt: expiresAt,
		Images:    images,
	}
	if err := model.CreateDrawGeneration(&generation); err != nil {
		_ = os.RemoveAll(filepath.Join(drawImageRoot(), strconv.Itoa(userID), generationID))
		return nil, err
	}

	data, err := common.Marshal(savedItems)
	if err != nil {
		return nil, err
	}
	response["data"] = data
	return common.Marshal(response)
}

func ListDrawHistory(userID int) ([]DrawHistoryRecord, error) {
	generations, err := model.ListActiveDrawGenerations(userID, time.Now().Unix(), drawImageHistoryLimit)
	if err != nil {
		return nil, err
	}
	records := make([]DrawHistoryRecord, 0, len(generations))
	for _, generation := range generations {
		images := make([]DrawHistoryImage, 0, len(generation.Images))
		for _, image := range generation.Images {
			images = append(images, DrawHistoryImage{
				ID:  image.ID,
				Src: "/api/draw/images/" + image.ID,
			})
		}
		records = append(records, DrawHistoryRecord{
			ID:        generation.ID,
			Prompt:    generation.Prompt,
			Model:     generation.Model,
			CreatedAt: generation.CreatedAt,
			ExpiresAt: generation.ExpiresAt,
			Images:    images,
		})
	}
	return records, nil
}

func OpenDrawImage(userID int, imageID string) (*os.File, *model.DrawImage, error) {
	image, err := model.GetActiveDrawImage(imageID, userID, time.Now().Unix())
	if err != nil {
		return nil, nil, err
	}
	imagePath, err := resolveDrawImagePath(image)
	if err != nil {
		return nil, nil, err
	}
	file, err := os.Open(imagePath)
	if err != nil {
		return nil, nil, err
	}
	return file, image, nil
}

// resolveDrawImagePath returns the absolute on-disk path of a stored draw
// image after verifying it stays inside the draw image root, so callers never
// touch files outside the sandbox even if a database record is malformed.
func resolveDrawImagePath(image *model.DrawImage) (string, error) {
	root, err := filepath.Abs(drawImageRoot())
	if err != nil {
		return "", err
	}
	imagePath, err := filepath.Abs(image.Path)
	if err != nil {
		return "", err
	}
	relativePath, err := filepath.Rel(root, imagePath)
	if err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)) {
		return "", errors.New("invalid generated image path")
	}
	return imagePath, nil
}

// DeleteDrawImage removes a single generated image from history: the database
// record, the file on disk, and (when it was the last image of its generation)
// the generation record itself, so no empty history entries linger.
func DeleteDrawImage(userID int, imageID string) error {
	image, err := model.GetUserDrawImage(imageID, userID)
	if err != nil {
		return err
	}
	imagePath, err := resolveDrawImagePath(image)
	if err != nil {
		return err
	}
	generationID := image.GenerationID
	if err := model.DeleteDrawImageRecord(image); err != nil {
		return err
	}
	if err := os.Remove(imagePath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	// Best-effort: remove the generation directory once it is empty.
	_ = os.Remove(filepath.Dir(imagePath))

	remaining, err := model.CountDrawGenerationImages(generationID, userID)
	if err != nil {
		return err
	}
	if remaining == 0 {
		return model.DeleteDrawGenerationRecord(generationID, userID)
	}
	return nil
}

func deleteDrawGenerationBatch(generations []model.DrawGeneration) error {
	if len(generations) == 0 {
		return nil
	}
	ids := make([]string, 0, len(generations))
	for _, generation := range generations {
		ids = append(ids, generation.ID)
	}
	if err := model.DeleteDrawGenerations(ids); err != nil {
		return err
	}
	for _, generation := range generations {
		for _, image := range generation.Images {
			if err := os.Remove(image.Path); err != nil && !errors.Is(err, os.ErrNotExist) {
				common.SysError("failed to remove expired generated image: " + err.Error())
			}
		}
		_ = os.Remove(filepath.Join(drawImageRoot(), strconv.Itoa(generation.UserID), generation.ID))
	}
	return nil
}

func DeleteDrawHistory(userID int) error {
	for {
		generations, err := model.ListUserDrawGenerations(userID, drawImageCleanupBatch)
		if err != nil {
			return err
		}
		if len(generations) == 0 {
			return nil
		}
		if err := deleteDrawGenerationBatch(generations); err != nil {
			return err
		}
	}
}

func cleanupExpiredDrawImages() {
	for {
		generations, err := model.ListExpiredDrawGenerations(time.Now().Unix(), drawImageCleanupBatch)
		if err != nil {
			common.SysError("failed to list expired generated images: " + err.Error())
			return
		}
		if len(generations) == 0 {
			return
		}
		if err := deleteDrawGenerationBatch(generations); err != nil {
			common.SysError("failed to clean expired generated images: " + err.Error())
			return
		}
	}
}

func StartDrawImageCleanup() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		cleanupExpiredDrawImages()
		ticker := time.NewTicker(drawImageCleanupInterval)
		defer ticker.Stop()
		for range ticker.C {
			cleanupExpiredDrawImages()
		}
	}()
}
