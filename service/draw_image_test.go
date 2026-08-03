package service

import (
	"context"
	"io"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPersistDrawGenerationResponseStoresOnDiskAndExpires(t *testing.T) {
	previousDB := model.DB
	t.Cleanup(func() {
		model.DB = previousDB
	})
	db, err := gorm.Open(sqlite.Open("file:draw-image-test?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.DrawGeneration{}, &model.DrawImage{}))
	model.DB = db
	t.Setenv("DRAW_IMAGE_DIR", t.TempDir())

	response, err := PersistDrawGenerationResponse(
		context.Background(),
		42,
		"a lighthouse",
		"gpt-image-2",
		[]byte(`{"created":1700000000,"data":[{"b64_json":"iVBORw0KGgo="}]}`),
	)
	require.NoError(t, err)
	assert.NotContains(t, string(response), "iVBORw0KGgo")
	assert.Contains(t, string(response), "/api/draw/images/")

	history, err := ListDrawHistory(42)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Len(t, history[0].Images, 1)
	assert.Equal(t, "a lighthouse", history[0].Prompt)
	assert.Equal(t, "gpt-image-2", history[0].Model)
	assert.InDelta(t, time.Now().Add(24*time.Hour).Unix(), history[0].ExpiresAt, 2)

	file, image, err := OpenDrawImage(42, history[0].Images[0].ID)
	require.NoError(t, err)
	data, err := io.ReadAll(file)
	require.NoError(t, err)
	require.NoError(t, file.Close())
	assert.Equal(t, []byte{137, 80, 78, 71, 13, 10, 26, 10}, data)
	imagePath := image.Path

	expiredAt := time.Now().Add(-time.Minute).Unix()
	require.NoError(t, db.Model(&model.DrawGeneration{}).Where("id = ?", history[0].ID).
		Update("expires_at", expiredAt).Error)
	require.NoError(t, db.Model(&model.DrawImage{}).Where("id = ?", image.ID).
		Update("expires_at", expiredAt).Error)

	cleanupExpiredDrawImages()

	_, statErr := os.Stat(imagePath)
	assert.ErrorIs(t, statErr, os.ErrNotExist)
	history, err = ListDrawHistory(42)
	require.NoError(t, err)
	assert.Empty(t, history)
}

func TestDeleteDrawImageRemovesFileRecordAndEmptyGeneration(t *testing.T) {
	previousDB := model.DB
	t.Cleanup(func() {
		model.DB = previousDB
	})
	db, err := gorm.Open(sqlite.Open("file:draw-image-delete-test?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.DrawGeneration{}, &model.DrawImage{}))
	model.DB = db
	imageDir := t.TempDir()
	t.Setenv("DRAW_IMAGE_DIR", imageDir)

	response, err := PersistDrawGenerationResponse(
		context.Background(),
		7,
		"two images",
		"gpt-image-2",
		[]byte(`{"created":1700000000,"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="},{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}]}`),
	)
	require.NoError(t, err)
	require.Contains(t, string(response), "/api/draw/images/")

	history, err := ListDrawHistory(7)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Len(t, history[0].Images, 2)
	firstID := history[0].Images[0].ID
	secondID := history[0].Images[1].ID

	// Deleting one image removes only that record and its file.
	require.NoError(t, DeleteDrawImage(7, secondID))
	history, err = ListDrawHistory(7)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Len(t, history[0].Images, 1)
	assert.Equal(t, firstID, history[0].Images[0].ID)
	_, err = model.GetUserDrawImage(secondID, 7)
	require.Error(t, err)

	// Deleting the last image removes the generation record as well.
	require.NoError(t, DeleteDrawImage(7, firstID))
	history, err = ListDrawHistory(7)
	require.NoError(t, err)
	assert.Empty(t, history)
	_, err = model.GetUserDrawImage(firstID, 7)
	require.Error(t, err)

	// Another user cannot delete this user's image.
	require.Error(t, DeleteDrawImage(8, firstID))
}
