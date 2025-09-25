// watermarklab-website/js/models.js
// 模型管理模块

class ModelManager {
    constructor() {
        this.models = [];
        this.selectedModels = [];
        this.loadModels();
    }

    // 加载模型数据 - 混合方式：先尝试动态扫描，失败后使用预定义列表
    async loadModels() {
        try {
            const modelsDir = '../data/models';

            let files = await this.tryDynamicScan(modelsDir);
            if (files.length === 0) {
                files = await this.getPredefinedModelFiles();
            }

            this.models = [];
            for (const filename of files) {
                try {
                    const response = await fetch(`${modelsDir}/${filename}`);
                    if (response.ok) {
                        const data = await response.json();
                        const model = this.extractModelInfo(data, filename);
                        if (model) {
                            this.models.push(model);
                        }
                    }
                } catch (error) {
                    console.log(`Failed to load: ${filename}`, error.message);
                }
            }

            console.log('Loaded models:', this.models);

            if (this.models.length === 0) {
                this.showImportOnlyMode();
            } else {
                this.renderModels();
            }
        } catch (error) {
            console.error('Failed to load models:', error);
            this.showImportOnlyMode();
        }
    }

    async tryDynamicScan(modelsDir) {
        const files = [];
        try {
            const response = await fetch(modelsDir + '/');
            if (response.ok) {
                const htmlText = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                const links = doc.querySelectorAll('a[href]');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (href && href.startsWith('result_') && href.endsWith('.json')) {
                        files.push(href);
                    }
                }
            }
        } catch (error) {
            console.warn('Dynamic scan failed, using predefined list:', error);
        }
        return files;
    }

    async getPredefinedModelFiles() {
        return [
            'result_dctDwt.json',
            'result_StegaStamp.json',
            'result_TreeRing-Ring.json',
            'result_StableSignature.json',
            'result_rivaGAN.json',
            'result_dctDwtSvd.json',
            'result_InvisMark.json',
            'result_GaussianShading.json',
            'result_TrustMark-Q.json'
        ];
    }

    extractModelInfo(jsonData, filename) {
        try {
            const modelId = filename.replace(/\.json$/, '').replace(/^result_/, '');
            const modelName = jsonData.modelname || modelId;
            const modelType = jsonData.modeltype || 'PGW';
            const payload = jsonData.payload || 30;
            const imageSize = jsonData.imagesize || 256;
            const description = jsonData.description || `Results from ${modelName}`;

            return {
                id: modelId,
                name: modelName,
                type: modelType.includes('In-Generation') ? 'IGW' : 'PGW',
                description: description,
                thumbnail: modelName.charAt(0).toUpperCase(),
                config: {
                    payload: payload,
                    imagesize: imageSize,
                    modeltype: modelType
                },
                rawData: jsonData
            };
        } catch (error) {
            console.warn('Failed to extract model info:', error);
            return null;
        }
    }

    showImportOnlyMode() {
        const container = document.getElementById('models-container');
        if (!container) return;
        container.innerHTML = `
            <div class="no-models-message" style="text-align: center; padding: 40px; color: #666;">
                <h3>No pre-defined models found</h3>
                <p>Please import your own models using the button below.</p>
            </div>
        `;
        const enterBtn = document.getElementById('enter-system-btn');
        if (enterBtn) {
            enterBtn.style.display = 'none';
        }
    }

    renderModels() {
        const container = document.getElementById('models-container');
        if (!container) return;

        if (this.models.length === 0) {
            this.showImportOnlyMode();
            return;
        }

        container.innerHTML = '';

        const outerContainer = document.createElement('div');
        outerContainer.style.display = 'flex';
        outerContainer.style.justifyContent = 'center';
        outerContainer.style.alignItems = 'flex-start';
        outerContainer.style.width = '100%';
        outerContainer.style.padding = '20px 0';

        const gridContainer = document.createElement('div');
        gridContainer.className = 'models-grid-container';
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
        gridContainer.style.gap = '25px';
        gridContainer.style.padding = '20px';
        gridContainer.style.maxWidth = '1400px';
        gridContainer.style.width = '100%';

        if (this.models.length < 4) {
            const emptySlots = 4 - this.models.length;
            const startPadding = Math.floor(emptySlots / 2);
            for (let i = 0; i < startPadding; i++) {
                const placeholder = document.createElement('div');
                placeholder.style.visibility = 'hidden';
                gridContainer.appendChild(placeholder);
            }
        }

        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 1400px) {
                .models-grid-container { grid-template-columns: repeat(4, 1fr) !important; }
            }
            @media (max-width: 1100px) {
                .models-grid-container { grid-template-columns: repeat(3, 1fr) !important; }
            }
            @media (max-width: 800px) {
                .models-grid-container { grid-template-columns: repeat(2, 1fr) !important; gap: 20px !important; }
            }
            @media (max-width: 500px) {
                .models-grid-container { grid-template-columns: repeat(1, 1fr) !important; gap: 15px !important; }
            }
            
            .model-card {
                aspect-ratio: 8/6;
                width: 100%;
                max-width: 220px;
                background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                border-radius: 15px;
                padding: 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                position: relative;
                border: 2px solid transparent;
                margin: 0 auto;
            }
            
            .model-card:hover {
                border-color: #007bff;
                box-shadow: 0 6px 20px rgba(0,0,0,0.12);
                transform: none;
            }
            
            .model-card.selected {
                border-color: #007bff;
                box-shadow: 0 0 0 2px rgba(0,123,255,0.3);
                transform: none;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            
            .tooltip {
                position: fixed;
                background: rgba(0,123,255,0.9);
                color: white;
                padding: 15px;
                border-radius: 8px;
                font-size: 0.8rem;
                max-width: 280px;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.2s ease;
                box-shadow: 0 4px 12px rgba(0,123,255,0.2);
                white-space: normal;
                line-height: 1.4;
                pointer-events: none;
            }
            .tooltip::after {
                display: none !important;
                content: none !important;
            }
        `;
        document.head.appendChild(style);

        this.models.forEach(model => {
            const card = this.createModelCard(model);
            gridContainer.appendChild(card);
        });

        if (this.models.length < 4) {
            const emptySlots = 4 - this.models.length;
            const startPadding = Math.floor(emptySlots / 2);
            const endPadding = emptySlots - startPadding;
            for (let i = 0; i < endPadding; i++) {
                const placeholder = document.createElement('div');
                placeholder.style.visibility = 'hidden';
                gridContainer.appendChild(placeholder);
            }
        }

        outerContainer.appendChild(gridContainer);
        container.appendChild(outerContainer);

        const enterBtn = document.getElementById('enter-system-btn');
        if (enterBtn) {
            enterBtn.style.display = 'block';
        }
    }

    createModelCard(model) {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.dataset.id = model.id;

        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = model.description;
        document.body.appendChild(tooltip); // 把 tooltip 放到 body 下

        card.innerHTML = `
            <div class="model-thumbnail" style="
                width: 70px;
                height: 70px;
                margin: 0 auto 15px;
                border-radius: 50%;
                background: linear-gradient(135deg, #007bff 0%, #17a2b8 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 1.2rem;
                text-align: center;
                box-shadow: 0 3px 8px rgba(0,123,255,0.2);
            ">${model.thumbnail}</div>
            <div class="model-name">${model.name}</div>
            <div class="model-type">${model.type}</div>
            <div class="model-description">
                <small>Payload: ${model.config.payload} bits</small><br>
                <small>Image Size: ${model.config.imagesize}px</small>
            </div>
        `;

        card.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY + 12) + 'px';
            tooltip.style.opacity = 1;
        });

        card.addEventListener('mouseleave', () => {
            tooltip.style.opacity = 0;
        });

        card.addEventListener('click', () => {
            this.toggleModelSelection(model.id, card);
        });

        return card;
    }

    toggleModelSelection(modelId, cardElement) {
        const index = this.selectedModels.indexOf(modelId);
        if (index > -1) {
            this.selectedModels.splice(index, 1);
            cardElement.classList.remove('selected');
        } else {
            this.selectedModels.push(modelId);
            cardElement.classList.add('selected');
        }
    }

    getSelectedModels() {
        return this.models.filter(model =>
            this.selectedModels.includes(model.id)
        );
    }

    addModel(modelData) {
        this.models.push(modelData);
        this.renderModels();
    }
}

const modelManager = new ModelManager();

document.addEventListener('DOMContentLoaded', function() {
    const importBtn = document.getElementById('import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', function() {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.multiple = true;

            fileInput.onchange = async function(event) {
                const files = event.target.files;
                if (files.length > 0) {
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        try {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                try {
                                    const jsonData = JSON.parse(e.target.result);
                                    const model = modelManager.extractModelInfo(jsonData, file.name);
                                    if (model) {
                                        modelManager.addModel(model);
                                    }
                                } catch (error) {
                                    console.error('Failed to parse JSON:', error);
                                    alert('Failed to parse JSON file: ' + file.name + '\nError: ' + error.message);
                                }
                            };
                            reader.readAsText(file);
                        } catch (error) {
                            console.error('Failed to read file:', error);
                            alert('Failed to read file: ' + file.name);
                        }
                    }
                }
            };
            fileInput.click();
        });
    }

    const enterBtn = document.getElementById('enter-system-btn');
    if (enterBtn) {
        enterBtn.addEventListener('click', function() {
            if (modelManager.selectedModels.length === 0) {
                // 使用自定义 Modal 替代 alert
                if (typeof showModalAlert === 'function') { // 确保 Modal 脚本已加载
                    showModalAlert('No model was selected!', 'Please select at least one model before entering system', null, false);
                } else {
                    // Fallback to alert if modal script is not loaded
                    alert('Please select at least one model!');
                }
                return;
            }
            localStorage.setItem('selectedModels', JSON.stringify(modelManager.selectedModels));
            window.location.href = 'performance-analysis.html';
        });
    }

    const backBtn = document.getElementById('back-nevi');
    if (backBtn) {
        backBtn.addEventListener('click', function(e) {
            window.location.href = '../pages/navigation.html';
        });
    }
});