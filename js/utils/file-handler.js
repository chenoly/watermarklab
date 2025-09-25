// watermarklab-website/js/utils/file-handler.js
// 文件处理工具

class FileHandler {
    constructor() {
        this.uploadProgress = document.getElementById('upload-progress');
        this.progressBar = document.getElementById('progress');
        this.progressText = document.getElementById('progress-text');
    }

    // 处理文件上传
    handleFileUpload(inputElement, callback) {
        inputElement.addEventListener('change', async (event) => {
            const files = event.target.files;
            if (files.length === 0) return;

            this.showProgress();

            for (let i = 0; i < files.length; i++) {
                await this.uploadFile(files[i], callback);
            }

            this.hideProgress();
        });
    }

    // 上传单个文件
    async uploadFile(file, callback) {
        return new Promise((resolve) => {
            // 模拟上传进度
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 10;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);

                    // 模拟上传完成
                    setTimeout(() => {
                        if (callback) callback(file);
                        resolve();
                    }, 500);
                }

                this.updateProgress(progress);
            }, 100);
        });
    }

    // 显示进度条
    showProgress() {
        if (this.uploadProgress) {
            this.uploadProgress.style.display = 'block';
        }
    }

    // 隐藏进度条
    hideProgress() {
        if (this.uploadProgress) {
            setTimeout(() => {
                this.uploadProgress.style.display = 'none';
            }, 1000);
        }
    }

    // 更新进度
    updateProgress(percentage) {
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
        }
        if (this.progressText) {
            this.progressText.textContent = `Uploading: ${Math.round(percentage)}%`;
        }
    }

    // 读取JSON文件
    readJSONFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}

// 导出文件处理器实例
const fileHandler = new FileHandler();