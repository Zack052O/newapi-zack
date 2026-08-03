package middleware

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const DrawTokenIDHeader = "X-Draw-Token-Id"

// maxDrawReferenceImages bounds how many reference images a single draw
// request may carry. The dashboard uploader allows four; the cap is a
// defensive backstop so the multipart body stays bounded.
const maxDrawReferenceImages = 20

type drawGenerationRequest struct {
	Prompt string   `json:"prompt"`
	Model  string   `json:"model"`
	N      *uint    `json:"n"`
	Images []string `json:"images"`
}

func DrawTokenAuth(relayPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenID, err := strconv.Atoi(c.GetHeader(DrawTokenIDHeader))
		if err != nil || tokenID <= 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "Invalid API key",
			})
			return
		}
		token, err := model.GetTokenByIds(tokenID, c.GetInt("id"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{
				"success": false,
				"message": "API key not found",
			})
			return
		}

		c.Request.Header.Set("Authorization", "Bearer "+token.GetFullKey())
		c.Request.URL.Path = relayPath
		TokenAuth()(c)
	}
}

type drawResponseWriter struct {
	gin.ResponseWriter
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func (writer *drawResponseWriter) WriteHeader(code int) {
	if writer.wroteHeader {
		return
	}
	writer.status = code
	writer.wroteHeader = true
}

func (writer *drawResponseWriter) Write(data []byte) (int, error) {
	if !writer.wroteHeader {
		writer.WriteHeader(http.StatusOK)
	}
	return writer.body.Write(data)
}

func (writer *drawResponseWriter) WriteString(data string) (int, error) {
	if !writer.wroteHeader {
		writer.WriteHeader(http.StatusOK)
	}
	return writer.body.WriteString(data)
}

func (writer *drawResponseWriter) WriteHeaderNow() {
	if !writer.wroteHeader {
		writer.WriteHeader(http.StatusOK)
	}
}

func (writer *drawResponseWriter) Status() int {
	if writer.status == 0 {
		return http.StatusOK
	}
	return writer.status
}

func (writer *drawResponseWriter) Size() int {
	return writer.body.Len()
}

func (writer *drawResponseWriter) Written() bool {
	return writer.wroteHeader
}

func (writer *drawResponseWriter) Flush() {}

func PersistDrawResponse() gin.HandlerFunc {
	return func(c *gin.Context) {
		var request drawGenerationRequest
		if err := common.UnmarshalBodyReusable(c, &request); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error": gin.H{"message": "Invalid image generation request"},
			})
			return
		}
		if len(request.Images) > 0 {
			// Reference images are relayed through the standard
			// /v1/images/edits multipart format, which is how gpt-image-class
			// upstreams receive them. Without this conversion the JSON
			// "images" array on /v1/images/generations is silently ignored by
			// OpenAI-compatible providers.
			if err := convertDrawRequestWithImages(c, &request); err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error": gin.H{"message": err.Error()},
				})
				return
			}
		}

		originalWriter := c.Writer
		bufferedWriter := &drawResponseWriter{ResponseWriter: originalWriter}
		c.Writer = bufferedWriter
		c.Next()
		c.Writer = originalWriter

		status := bufferedWriter.Status()
		responseBody := bufferedWriter.body.Bytes()
		if status >= http.StatusOK && status < http.StatusMultipleChoices {
			persistedBody, err := service.PersistDrawGenerationResponse(
				c.Request.Context(),
				c.GetInt("id"),
				request.Prompt,
				request.Model,
				responseBody,
			)
			if err != nil {
				common.SysError("failed to persist draw response: " + err.Error())
			} else {
				responseBody = persistedBody
			}
		}

		originalWriter.Header().Del("Content-Length")
		originalWriter.Header().Set("Content-Length", fmt.Sprintf("%d", len(responseBody)))
		originalWriter.WriteHeader(status)
		if _, err := originalWriter.Write(responseBody); err != nil {
			common.SysError("failed to write draw response: " + err.Error())
		}
	}
}

// convertDrawRequestWithImages replaces the JSON request body with a
// multipart /v1/images/edits body containing the decoded reference images and
// rewrites the relay path so the upstream receives real image files instead of
// an unrecognized "images" JSON field.
func convertDrawRequestWithImages(c *gin.Context, request *drawGenerationRequest) error {
	if len(request.Images) > maxDrawReferenceImages {
		return fmt.Errorf("too many reference images")
	}
	count := uint(1)
	if request.N != nil && *request.N > 0 {
		count = *request.N
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("model", request.Model); err != nil {
		return err
	}
	if err := writer.WriteField("prompt", request.Prompt); err != nil {
		return err
	}
	if err := writer.WriteField("n", strconv.FormatUint(uint64(count), 10)); err != nil {
		return err
	}

	fieldName := "image"
	if len(request.Images) > 1 {
		fieldName = "image[]"
	}
	for index, dataURL := range request.Images {
		mimeType, data, err := decodeDrawImageDataURL(dataURL)
		if err != nil {
			return fmt.Errorf("invalid reference image %d: %w", index, err)
		}
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", fmt.Sprintf(
			`form-data; name="%s"; filename="reference-%d.%s"`,
			fieldName,
			index,
			drawImageFileExtension(mimeType),
		))
		header.Set("Content-Type", mimeType)
		part, err := writer.CreatePart(header)
		if err != nil {
			return err
		}
		if _, err := part.Write(data); err != nil {
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}

	storage, err := common.CreateBodyStorage(body.Bytes())
	if err != nil {
		return err
	}
	if previous, exists := c.Get(common.KeyBodyStorage); exists {
		if previousStorage, ok := previous.(common.BodyStorage); ok {
			_ = previousStorage.Close()
		}
	}
	c.Set(common.KeyBodyStorage, storage)
	c.Request.Body = io.NopCloser(storage)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	c.Request.ContentLength = int64(body.Len())
	c.Request.URL.Path = "/v1/images/edits"
	return nil
}

func decodeDrawImageDataURL(dataURL string) (mimeType string, data []byte, err error) {
	commaIndex := strings.IndexByte(dataURL, ',')
	if commaIndex <= 0 {
		return "", nil, fmt.Errorf("missing data URL separator")
	}
	header := dataURL[:commaIndex]
	if !strings.HasPrefix(header, "data:") || !strings.HasSuffix(header, ";base64") {
		return "", nil, fmt.Errorf("unsupported image data URL")
	}
	mimeType = strings.TrimPrefix(strings.TrimSuffix(header, ";base64"), "data:")
	if mimeType == "" {
		mimeType = "image/png"
	}
	data, err = base64.StdEncoding.DecodeString(dataURL[commaIndex+1:])
	if err != nil {
		return "", nil, fmt.Errorf("invalid base64 image data")
	}
	return mimeType, data, nil
}

func drawImageFileExtension(mimeType string) string {
	switch mimeType {
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "image/avif":
		return "avif"
	default:
		return "png"
	}
}
