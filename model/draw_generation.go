package model

import "gorm.io/gorm"

type DrawGeneration struct {
	ID        string      `json:"id" gorm:"type:varchar(36);primaryKey"`
	UserID    int         `json:"user_id" gorm:"index:idx_draw_generation_user_created,priority:1"`
	Prompt    string      `json:"prompt" gorm:"type:text"`
	Model     string      `json:"model" gorm:"type:varchar(191)"`
	CreatedAt int64       `json:"created_at" gorm:"bigint;index:idx_draw_generation_user_created,priority:2"`
	ExpiresAt int64       `json:"expires_at" gorm:"bigint;index"`
	Images    []DrawImage `json:"images" gorm:"foreignKey:GenerationID"`
}

type DrawImage struct {
	ID           string `json:"id" gorm:"type:varchar(36);primaryKey"`
	GenerationID string `json:"generation_id" gorm:"type:varchar(36);index"`
	UserID       int    `json:"user_id" gorm:"index"`
	Path         string `json:"-" gorm:"type:text"`
	MIMEType     string `json:"mime_type" gorm:"type:varchar(64)"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
	ExpiresAt    int64  `json:"expires_at" gorm:"bigint;index"`
}

func CreateDrawGeneration(generation *DrawGeneration) error {
	return DB.Create(generation).Error
}

func ListActiveDrawGenerations(userID int, now int64, limit int) ([]DrawGeneration, error) {
	generations := make([]DrawGeneration, 0)
	err := DB.
		Preload("Images", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC")
		}).
		Where("user_id = ? AND expires_at > ?", userID, now).
		Order("created_at DESC").
		Limit(limit).
		Find(&generations).Error
	return generations, err
}

func GetActiveDrawImage(id string, userID int, now int64) (*DrawImage, error) {
	var image DrawImage
	err := DB.Where("id = ? AND user_id = ? AND expires_at > ?", id, userID, now).
		First(&image).Error
	return &image, err
}

func GetUserDrawImage(id string, userID int) (*DrawImage, error) {
	var image DrawImage
	err := DB.Where("id = ? AND user_id = ?", id, userID).First(&image).Error
	return &image, err
}

func DeleteDrawImageRecord(image *DrawImage) error {
	return DB.Delete(image).Error
}

func CountDrawGenerationImages(generationID string, userID int) (int64, error) {
	var count int64
	err := DB.Model(&DrawImage{}).
		Where("generation_id = ? AND user_id = ?", generationID, userID).
		Count(&count).Error
	return count, err
}

func DeleteDrawGenerationRecord(generationID string, userID int) error {
	return DB.Where("id = ? AND user_id = ?", generationID, userID).
		Delete(&DrawGeneration{}).Error
}

func ListExpiredDrawGenerations(now int64, limit int) ([]DrawGeneration, error) {
	generations := make([]DrawGeneration, 0)
	err := DB.
		Preload("Images").
		Where("expires_at <= ?", now).
		Order("expires_at ASC").
		Limit(limit).
		Find(&generations).Error
	return generations, err
}

func ListUserDrawGenerations(userID int, limit int) ([]DrawGeneration, error) {
	generations := make([]DrawGeneration, 0)
	err := DB.
		Preload("Images").
		Where("user_id = ?", userID).
		Order("created_at ASC").
		Limit(limit).
		Find(&generations).Error
	return generations, err
}

func DeleteDrawGenerations(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("generation_id IN ?", ids).Delete(&DrawImage{}).Error; err != nil {
			return err
		}
		return tx.Where("id IN ?", ids).Delete(&DrawGeneration{}).Error
	})
}
