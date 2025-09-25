// watermarklab-website/js/visualization.js
// 可视化主逻辑

class VisualizationManager {
    constructor() {
        this.selectedModels = [];
        this.visualizationData = {};
        this.init();
    }

    // 初始化
    init() {
        // 从localStorage获取选中的模型
        const selectedModelsStr = localStorage.getItem('selectedModels');
        if (selectedModelsStr) {
            this.selectedModels = JSON.parse(selectedModelsStr);
        }

        // 加载可视化数据
        this.loadVisualizationData();

        // 渲染所有可视化内容
        this.renderAllVisualizations();
    }

    // 加载可视化数据
    async loadVisualizationData() {
        try {
            // 模拟加载数据
            // 实际项目中这里会从服务器加载数据
            this.visualizationData = {
                settings: this.getExperimentSettings(),
                visualQuality: await this.loadVisualQualityData(),
                robustness: await this.loadRobustnessData(),
                attackPerformance: await this.loadAttackPerformanceData()
            };
        } catch (error) {
            console.error('Failed to load visualization data:', error);
        }
    }

    // 获取实验设置
    getExperimentSettings() {
        return [
            {
                model: 'HiNet',
                type: 'PGW',
                payload: 30,
                imagesize: 256
            },
            {
                model: 'StegaStamp',
                type: 'IGW',
                payload: 50,
                imagesize: 512
            }
        ];
    }

    // 加载视觉质量数据
    async loadVisualQualityData() {
        // 模拟数据
        return {
            PSNR: {
                'HiNet': [35.2, 34.8, 36.1, 35.5, 34.9],
                'StegaStamp': [32.1, 31.8, 32.5, 32.0, 32.3]
            },
            SSIM: {
                'HiNet': [0.98, 0.97, 0.99, 0.98, 0.97],
                'StegaStamp': [0.95, 0.94, 0.96, 0.95, 0.95]
            },
            FID: {
                dataset: 'MS-COCO-2017-VAL',
                scores: {
                    'HiNet': 12.5,
                    'StegaStamp': 15.2
                }
            }
        };
    }

    async loadRobustnessData() {
        return {
            overallRanking: {
                'HiNet': 85,
                'StegaStamp': 78
            },
            specificMetrics: {
                'JPEG Compression': {
                    'HiNet': 92,
                    'StegaStamp': 85
                },
                'Gaussian Noise': {
                    'HiNet': 88,
                    'StegaStamp': 82
                },
                'Rotation': {
                    'HiNet': 75,
                    'StegaStamp': 70
                }
            }
        };
    }

    async loadAttackPerformanceData() {
        // 模拟数据
        return {
            attackers: [
                { name: 'JPEG Compression', score: 95 },
                { name: 'Gaussian Noise', score: 88 },
                { name: 'Rotation', score: 75 },
                { name: 'Scaling', score: 82 },
                { name: 'Brightness', score: 70 }
            ]
        };
    }

    // 渲染所有可视化内容
    renderAllVisualizations() {
        this.renderExperimentSettings();
        this.renderVisualQualityCharts();
        this.renderRobustnessCharts();
        this.renderAttackPerformanceChart();
    }

    // 渲染实验设置
    renderExperimentSettings() {
        const tableBody = document.querySelector('#settings-table tbody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        this.visualizationData.settings.forEach(setting => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${setting.model}</td>
                <td>${setting.type}</td>
                <td>${setting.payload}</td>
                <td>${setting.imagesize}×${setting.imagesize}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // 渲染视觉质量图表
    renderVisualQualityCharts() {
        // PSNR图表
        const psnrData = this.visualizationData.visualQuality.PSNR;
        this.createBoxPlot('psnr-chart', 'PSNR Distribution', psnrData);

        // SSIM图表
        const ssimData = this.visualizationData.visualQuality.SSIM;
        this.createBoxPlot('ssim-chart', 'SSIM Distribution', ssimData);

        // FID图表
        const fidData = this.visualizationData.visualQuality.FID.scores;
        this.createBarChart('fid-chart', 'FID Scores', fidData);
    }

    // 渲染鲁棒性图表
    renderRobustnessCharts() {
        // 总体排名图表
        const overallData = this.visualizationData.robustness.overallRanking;
        this.createBarChart('overall-ranking-chart', 'Overall Robustness Ranking', overallData);

        // 具体指标图表
        const specificData = this.visualizationData.robustness.specificMetrics;
        this.renderSpecificMetrics(specificData);
    }

    // 渲染具体指标
    renderSpecificMetrics(metricsData) {
        const container = document.getElementById('robustness-charts-container');
        if (!container) return;

        container.innerHTML = '';

        Object.keys(metricsData).forEach(metricName => {
            const chartDiv = document.createElement('div');
            chartDiv.className = 'chart-item';
            chartDiv.id = `chart-${metricName.replace(/\s+/g, '-').toLowerCase()}`;
            container.appendChild(chartDiv);

            this.createBarChart(
                chartDiv.id,
                metricName,
                metricsData[metricName]
            );
        });
    }

    // 渲染攻击器性能图表
    renderAttackPerformanceChart() {
        const attackers = this.visualizationData.attackPerformance.attackers;
        const chartData = {};
        attackers.forEach(attacker => {
            chartData[attacker.name] = attacker.score;
        });

        this.createHorizontalBarChart('attack-ranking-chart', 'Attack Performance Ranking', chartData);
    }

    // 创建箱线图
    createBoxPlot(containerId, title, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const traces = [];
        Object.keys(data).forEach(modelName => {
            traces.push({
                y: data[modelName],
                type: 'box',
                name: modelName,
                boxpoints: 'all',
                jitter: 0.3,
                pointpos: -1.8
            });
        });

        const layout = {
            title: title,
            showlegend: true,
            yaxis: { title: title },
            margin: { t: 40, l: 50, r: 30, b: 50 }
        };

        Plotly.newPlot(container, traces, layout);
    }

    // 创建柱状图
    createBarChart(containerId, title, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const x = Object.keys(data);
        const y = Object.values(data);

        const trace = {
            x: x,
            y: y,
            type: 'bar',
            marker: {
                color: '#007bff'
            }
        };

        const layout = {
            title: title,
            xaxis: { title: 'Models' },
            yaxis: { title: title },
            margin: { t: 40, l: 50, r: 30, b: 50 }
        };

        Plotly.newPlot(container, [trace], layout);
    }

    // 创建水平柱状图
    createHorizontalBarChart(containerId, title, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 按分数排序
        const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]);
        const x = sortedEntries.map(entry => entry[1]);
        const y = sortedEntries.map(entry => entry[0]);

        const trace = {
            x: x,
            y: y,
            type: 'bar',
            orientation: 'h',
            marker: {
                color: '#17a2b8'
            }
        };

        const layout = {
            title: title,
            xaxis: { title: 'Effectiveness Score' },
            yaxis: { title: 'Attackers' },
            margin: { t: 40, l: 150, r: 30, b: 50 }
        };

        Plotly.newPlot(container, [trace], layout);
    }
}

// 初始化可视化管理器
let visualizationManager;

document.addEventListener('DOMContentLoaded', function() {
    // 确保Plotly已经加载
    if (typeof Plotly !== 'undefined') {
        visualizationManager = new VisualizationManager();
    } else {
        console.warn('Plotly not loaded, visualization disabled');
    }
});