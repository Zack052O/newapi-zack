package middleware

import (
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDrawTokenAuthRejectsTokensOwnedByAnotherUser(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
	user := createMiddlewarePATUser(t, "draw-token-owner", "draw-dashboard-pat")
	token := &model.Token{
		UserId:         user.Id,
		Key:            "draw-secret-token",
		Status:         common.TokenStatusEnabled,
		Name:           "draw token",
		CreatedTime:    time.Now().Unix(),
		ExpiredTime:    -1,
		UnlimitedQuota: true,
	}
	require.NoError(t, model.DB.Create(token).Error)

	router := gin.New()
	router.GET(
		"/draw",
		func(c *gin.Context) {
			userID, err := strconv.Atoi(c.GetHeader("X-Test-User-Id"))
			require.NoError(t, err)
			c.Set("id", userID)
			c.Next()
		},
		DrawTokenAuth("/v1/models"),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"path":     c.Request.URL.Path,
				"token_id": c.GetInt("token_id"),
			})
		},
	)

	foreignRequest := httptest.NewRequest(http.MethodGet, "/draw", nil)
	foreignRequest.Header.Set(DrawTokenIDHeader, strconv.Itoa(token.Id))
	foreignRequest.Header.Set("X-Test-User-Id", strconv.Itoa(user.Id+1))
	foreignResponse := httptest.NewRecorder()
	router.ServeHTTP(foreignResponse, foreignRequest)

	assert.Equal(t, http.StatusNotFound, foreignResponse.Code)
	assert.NotContains(t, foreignResponse.Body.String(), token.Key)

}

func TestDecodeDrawImageDataURL(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("fake-image"))
	mimeType, data, err := decodeDrawImageDataURL("data:image/png;base64," + encoded)
	require.NoError(t, err)
	assert.Equal(t, "image/png", mimeType)
	assert.Equal(t, "fake-image", string(data))

	_, _, err = decodeDrawImageDataURL("not-a-data-url")
	require.Error(t, err)

	_, _, err = decodeDrawImageDataURL("data:image/png;base64,!!!not-base64!!!")
	require.Error(t, err)
}

func TestConvertDrawRequestWithImagesBuildsEditsMultipart(t *testing.T) {
	encodedOne := base64.StdEncoding.EncodeToString([]byte("image-one"))
	encodedTwo := base64.StdEncoding.EncodeToString([]byte("image-two"))
	body := `{"model":"gpt-image-2","prompt":"a lighthouse","n":2,"images":["data:image/png;base64,` +
		encodedOne + `","data:image/jpeg;base64,` + encodedTwo + `"]}`

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/api/draw/generations", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	originalStorage, err := common.GetBodyStorage(c)
	require.NoError(t, err)
	c.Request.Body = io.NopCloser(originalStorage)

	request := &drawGenerationRequest{
		Prompt: "a lighthouse",
		Model:  "gpt-image-2",
		N:      common.GetPointer(uint(2)),
		Images: []string{
			"data:image/png;base64," + encodedOne,
			"data:image/jpeg;base64," + encodedTwo,
		},
	}
	require.NoError(t, convertDrawRequestWithImages(c, request))

	assert.Equal(t, "/v1/images/edits", c.Request.URL.Path)
	assert.True(t, strings.HasPrefix(c.Request.Header.Get("Content-Type"), "multipart/form-data"))

	form, err := common.ParseMultipartFormReusable(c)
	require.NoError(t, err)
	assert.Equal(t, "gpt-image-2", form.Value["model"][0])
	assert.Equal(t, "a lighthouse", form.Value["prompt"][0])
	assert.Equal(t, "2", form.Value["n"][0])
	require.Len(t, form.File["image[]"], 2)
	assert.Equal(t, "image-one", readMultipartFile(t, form.File["image[]"][0]))
	assert.Equal(t, "image-two", readMultipartFile(t, form.File["image[]"][1]))
}

func TestConvertDrawRequestWithImagesRejectsTooManyImages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/api/draw/generations", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	encoded := base64.StdEncoding.EncodeToString([]byte("x"))
	images := make([]string, maxDrawReferenceImages+1)
	for index := range images {
		images[index] = "data:image/png;base64," + encoded
	}
	err := convertDrawRequestWithImages(c, &drawGenerationRequest{
		Model:  "gpt-image-2",
		Prompt: "p",
		Images: images,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "too many reference images")
}

func readMultipartFile(t *testing.T, header *multipart.FileHeader) string {
	t.Helper()
	file, err := header.Open()
	require.NoError(t, err)
	defer file.Close()
	data, err := io.ReadAll(file)
	require.NoError(t, err)
	return string(data)
}
