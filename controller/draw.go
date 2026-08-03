package controller

import (
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func GetDrawHistory(c *gin.Context) {
	records, err := service.ListDrawHistory(c.GetInt("id"))
	if err != nil {
		common.SysError("failed to list draw history: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to load generation history",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": records})
}

func DeleteDrawHistory(c *gin.Context) {
	if err := service.DeleteDrawHistory(c.GetInt("id")); err != nil {
		common.SysError("failed to delete draw history: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to clear generation history",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func DeleteDrawImage(c *gin.Context) {
	if err := service.DeleteDrawImage(c.GetInt("id"), c.Param("id")); err != nil {
		common.SysError("failed to delete draw image: " + err.Error())
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Failed to delete image",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func GetDrawImage(c *gin.Context) {
	file, image, err := service.OpenDrawImage(c.GetInt("id"), c.Param("id"))
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	maxAge := image.ExpiresAt - time.Now().Unix()
	if maxAge < 0 {
		maxAge = 0
	}
	c.Header("Content-Type", image.MIMEType)
	c.Header("Cache-Control", "private, max-age="+strconv.FormatInt(maxAge, 10))
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, filepath.Base(image.Path), stat.ModTime(), file)
}
