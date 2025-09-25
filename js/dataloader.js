// script.js

// --- 数据加载和预处理 ---

let allResultsData = null; // 用于存储处理后的数据
const DATA_URL = 'result_StegaStamp.txt'; // 替换为实际路径

/**
 * 加载并解析 JSON 数据
 * @param {string} dataUrl - JSON 数据文件的 URL
 */
async function loadData(dataUrl) {
    try {
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();

        // --- 数据预处理 ---
        allResultsData = preprocessData(jsonData);
        console.log("数据加载并预处理完成:", allResultsData);

        // 数据加载完成后，初始化所有区域
        populateModelSelector(); // 填充模型选择器
        initializeRegion1(); // 初始化区域1
        initializeRegion2(); // 初始化区域2
        initializeRegion3(); // 初始化区域3
        initializeRegion4(); // 初始化区域4

    } catch (error) {
        console.error("加载或解析数据时出错:", error);
        alert("无法加载数据，请检查控制台获取详细信息。");
    }
}

/**
 * 预处理原始 JSON 数据，提取关键信息
 * @param {Object} rawData - 原始 JSON 数据
 * @returns {Object} 处理后的数据结构
 */
function preprocessData(rawData) {
    const processed = {
        models: {}, // 以模型名为 key 的对象
        noiseTypes: new Set(), // 所有出现过的噪声类型
        visualQualityMetrics: new Set(), // 所有出现过的视觉质量指标
        robustnessMetrics: new Set(), // 所有出现过的鲁棒性指标
        attackerNames: new Set() // 所有出现过的攻击器/噪声名称 (用于区域4)
    };

    // 遍历每个模型的结果
    for (const [modelName, modelData] of Object.entries(rawData)) {
        processed.models[modelName] = {
            name: modelName,
            config: {
                modelname: modelData.modelname || 'N/A',
                modeltype: modelData.modeltype || 'N/A',
                description: modelData.description || 'N/A',
                imagesize: modelData.imagesize || 'N/A',
                payload: modelData.payload || 'N/A',
                testdataset: modelData.testdataset || 'N/A',
                testvisualqualitymetrics: modelData.testvisualqualitymetrics ? modelData.testvisualqualitymetrics.join(', ') : 'N/A',
                testrobustnessmetrics: modelData.testrobustnessmetrics ? modelData.testrobustnessmetrics.join(', ') : 'N/A'
            },
            visualQuality: {}, // 存储视觉质量数据
            robustness: {}, // 存储鲁棒性数据 { noiseType: { factor: { metric: value } } }
            visualCompare: {}, // 存储可视化比较图像 (base64)
            attackEffectiveness: {} // { noise_type: [ {factor, vq_value, robust_value}, ... ] }
        };

        // --- 提取视觉质量数据 (区域 2.1) ---
        if (modelData.visualquality) {
            processed.models[modelName].visualQuality = modelData.visualquality;
            Object.keys(modelData.visualquality).forEach(m => processed.visualQualityMetrics.add(m));
        }

        // --- 提取鲁棒性数据 (区域 3) ---
        if (modelData.robustnessresult) {
            for (const [noiseType, factorsData] of Object.entries(modelData.robustnessresult)) {
                processed.noiseTypes.add(noiseType);
                processed.models[modelName].robustness[noiseType] = {};

                for (const [factor, metricsData] of Object.entries(factorsData)) {
                    processed.models[modelName].robustness[noiseType][factor] = {};
                    for (const [metric, value] of Object.entries(metricsData)) {
                        if (metric !== 'visualquality') {
                            processed.models[modelName].robustness[noiseType][factor][metric] = value;
                            processed.robustnessMetrics.add(metric);
                        } else {
                            // 可以选择性地存储 visualquality 到 robustness 结构中，如果需要
                        }
                    }
                }
            }
        }

        // --- 提取可视化比较图像 (区域 2.2, 4.2) ---
        if (modelData.visualcompare) {
            processed.models[modelName].visualCompare = modelData.visualcompare;
        }

        // --- 提取攻击器性能数据 (区域 3.3) ---
        if (modelData.robustnessresult) {
            for (const [noiseType, factorsData] of Object.entries(modelData.robustnessresult)) {
                if (noiseType === 'No_Attacking') continue;
                processed.noiseTypes.add(noiseType);
                processed.models[modelName].attackEffectiveness[noiseType] = [];

                for (const [factor, metricsData] of Object.entries(factorsData)) {
                    // 假设关注 PSNR 和 accuracy
                    const vqMetric = 'PSNR';
                    const robustMetric = 'Extract Accuracy'; // 注意可能需要处理数组平均

                    const vqValueObj = metricsData.visualquality?.[vqMetric];
                    const robustValueObj = metricsData[robustMetric];

                    if (vqValueObj !== undefined && robustValueObj !== undefined) {
                        // 处理可能的数组值，取平均
                        const processValue = (val) => Array.isArray(val) ? val.reduce((a, b) => a + b, 0) / val.length : parseFloat(val);

                        const vqValue = processValue(vqValueObj);
                        // 注意：Extract Accuracy 可能是数组，需要特别处理
                        let robustValue;
                        if (Array.isArray(robustValueObj)) {
                            robustValue = robustValueObj.reduce((a, b) => a + b, 0) / robustValueObj.length;
                        } else {
                            robustValue = parseFloat(robustValueObj);
                        }

                        if (!isNaN(vqValue) && !isNaN(robustValue)) {
                            processed.models[modelName].attackEffectiveness[noiseType].push({
                                factor: parseFloat(factor),
                                vq_value: vqValue,
                                robust_value: robustValue
                            });
                        }
                    }
                }
                // 按视觉质量 (PSNR) 排序
                if (processed.models[modelName].attackEffectiveness[noiseType].length > 0) {
                    processed.models[modelName].attackEffectiveness[noiseType].sort((a, b) => a.vq_value - b.vq_value);
                }
            }
        }
    }

    // --- 为区域 4.1 聚合所有模型的攻击器性能数据 ---
    processed.attackerPerformance = {}; // { metric_pair: { noise_type: [ {model, factor, vq_value, robust_value}, ... ] } }
    const metricPairKey = "PSNR_vs_accuracy";
    processed.attackerPerformance[metricPairKey] = {};

    for (const [modelName, modelData] of Object.entries(processed.models)) {
        if (modelData.attackEffectiveness) {
            for (const [noiseType, dataPoints] of Object.entries(modelData.attackEffectiveness)) {
                if (!processed.attackerPerformance[metricPairKey][noiseType]) {
                    processed.attackerPerformance[metricPairKey][noiseType] = [];
                }
                dataPoints.forEach(dp => {
                    processed.attackerPerformance[metricPairKey][noiseType].push({
                        model: modelName,
                        ...dp
                    });
                });
            }
        }
    }

    // 计算区域 4.1 的平均得分 (每个噪声器的平均 accuracy)
    processed.averageAttackerScores = {}; // { noise_type: average_accuracy }
    const scoreData = {}; // { noise_type: [accuracy_values] }
    for (const [modelName, modelData] of Object.entries(processed.models)) {
        if (modelData.attackEffectiveness) {
            for (const [noiseType, dataPoints] of Object.entries(modelData.attackEffectiveness)) {
                if (!scoreData[noiseType]) scoreData[noiseType] = [];
                dataPoints.forEach(dp => {
                    scoreData[noiseType].push(dp.robust_value);
                });
            }
        }
    }
    for (const [noiseType, accuracies] of Object.entries(scoreData)) {
        if (accuracies.length > 0) {
            const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
            processed.averageAttackerScores[noiseType] = avg;
            processed.attackerNames.add(noiseType);
        }
    }

    // --- 为区域 3.1 计算排名 ---
    processed.modelRankings = {}; // { noise_type: [ {model, score}, ... ] }, 'overall': [ ... ]
    const rankingData = {}; // { noise_type: { model: [scores] } }, 'overall': { model: [scores] }

    processed.noiseTypes.forEach(nt => {
        if(nt !== 'No_Attacking') rankingData[nt] = {};
    });
    rankingData['overall'] = {};
    Object.keys(processed.models).forEach(mn => {
        processed.noiseTypes.forEach(nt => {
             if(nt !== 'No_Attacking' && !rankingData[nt][mn]) rankingData[nt][mn] = [];
        });
        if (!rankingData['overall'][mn]) rankingData['overall'][mn] = [];
    });

    for (const [modelName, modelData] of Object.entries(processed.models)) {
        if (modelData.robustness) {
            for (const [noiseType, factorsData] of Object.entries(modelData.robustness)) {
                if (noiseType === 'No_Attacking') continue;
                const robustMetric = 'Extract Accuracy';
                for (const [factor, metrics] of Object.entries(factorsData)) {
                    const scoreObj = metrics[robustMetric];
                    if (scoreObj !== undefined) {
                        let scoreValue;
                        if (Array.isArray(scoreObj)) {
                            scoreValue = scoreObj.reduce((a, b) => a + b, 0) / scoreObj.length;
                        } else {
                            scoreValue = parseFloat(scoreObj);
                        }
                        if (!isNaN(scoreValue)) {
                            rankingData[noiseType][modelName].push(scoreValue);
                            rankingData['overall'][modelName].push(scoreValue);
                        }
                    }
                }
            }
        }
    }

    const calculateRankings = (dataObj) => {
        const rankings = [];
        for (const [modelName, scores] of Object.entries(dataObj)) {
            if (scores.length > 0) {
                const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                rankings.push({ model: modelName, score: parseFloat((avgScore || 0).toFixed(2)) }); // 保留两位小数
            }
        }
        rankings.sort((a, b) => b.score - a.score);
        return rankings;
    };

    processed.modelRankings['overall'] = calculateRankings(rankingData['overall']);
    processed.noiseTypes.forEach(nt => {
        if(nt !== 'No_Attacking') {
            processed.modelRankings[nt] = calculateRankings(rankingData[nt]);
        }
    });

    return processed;
}

// --- 可视化函数 ---

// --- 区域 1: 实验设置 ---
function initializeRegion1() {
    const container = document.getElementById('config-tables-container');
    container.innerHTML = ''; // 清空

    if (!allResultsData) return;

    for (const [modelName, modelData] of Object.entries(allResultsData.models)) {
        const tableDiv = document.createElement('div');
        tableDiv.style.marginBottom = '20px';
        tableDiv.innerHTML = `<h3>${modelName}</h3>`;

        const table = document.createElement('table');
        table.className = 'config-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const th1 = document.createElement('th');
        th1.textContent = '属性';
        const th2 = document.createElement('th');
        th2.textContent = '值';
        headerRow.appendChild(th1);
        headerRow.appendChild(th2);
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const [key, value] of Object.entries(modelData.config)) {
            const row = document.createElement('tr');
            const td1 = document.createElement('td');
            td1.textContent = key;
            const td2 = document.createElement('td');
            td2.textContent = value;
            row.appendChild(td1);
            row.appendChild(td2);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);

        tableDiv.appendChild(table);
        container.appendChild(tableDiv);
    }
}

// --- 区域 2: 视觉质量 ---
function initializeRegion2() {
    plotVisualQuality(); // 2.1
    // 2.2 将由模型选择器触发
}

// 2.1 绘制视觉质量柱状图
function plotVisualQuality() {
    const container = document.getElementById('visual-quality-plot');
    if (!allResultsData) {
        container.innerHTML = '<p>数据未加载</p>';
        return;
    }

    const metric = 'PSNR'; // 假设我们主要看 PSNR
    const modelNames = Object.keys(allResultsData.models);
    const values = modelNames.map(name => {
        const vqData = allResultsData.models[name].visualQuality[metric];
        if (vqData === undefined) return null;
        // 处理数组
        if (Array.isArray(vqData)) {
            return vqData.reduce((a, b) => a + b, 0) / vqData.length;
        }
        return parseFloat(vqData);
    }).filter(v => v !== null); // 过滤掉无效值

    const trace = {
        x: modelNames,
        y: values,
        type: 'bar',
        marker: {
            color: 'rgba(55, 128, 191, 0.7)',
            line: {
                color: 'rgba(55, 128, 191, 1.0)',
                width: 1
            }
        }
    };

    const layout = {
        title: `${metric} 指标对比`,
        xaxis: { title: '模型' },
        yaxis: { title: metric },
        margin: { t: 30, l: 40, r: 30, b: 100 } // 增加底部边距以适应标签
    };

    Plotly.newPlot(container, [trace], layout);
}

// 2.2 绘制 Base64 图像 (由模型选择器触发)
function plotStegoVisualization(selectedModelName) {
    const container = document.getElementById('stego-visualization-container');
    container.innerHTML = ''; // 清空

    if (!allResultsData || !selectedModelName) {
        container.innerHTML = '<p>请选择一个模型</p>';
        return;
    }

    const visualData = allResultsData.models[selectedModelName]?.visualCompare;
    if (!visualData) {
        container.innerHTML = '<p>该模型无可视化数据</p>';
        return;
    }

    // 假设 visualData 包含 stego, clean, residual, prompt 等 base64 字符串
    const imageTypes = ['stego', 'clean', 'residual'];
    imageTypes.forEach(type => {
        if (visualData[type]) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'image-item';

            const img = document.createElement('img');
            img.src = `data:image/png;base64,${visualData[type]}`;
            img.alt = `${type} image for ${selectedModelName}`;

            const label = document.createElement('div');
            label.className = 'image-item-label';
            label.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}`; // 首字母大写

            itemDiv.appendChild(img);
            itemDiv.appendChild(label);
            container.appendChild(itemDiv);
        }
    });

    // 显示 Prompt (如果需要)
    /*
    if (visualData.prompt) {
        const promptDiv = document.createElement('div');
        promptDiv.innerHTML = `<strong>Prompt:</strong> ${visualData.prompt}`;
        container.appendChild(promptDiv);
    }
    */
}

// --- 区域 3: 鲁棒性能 ---
function initializeRegion3() {
    plotModelRobustnessRanking(); // 3.1
    plotRobustness(); // 3.2
    // 3.3 将由模型选择器触发
}

// 3.1 绘制模型排名
function plotModelRobustnessRanking() {
    const container = document.getElementById('model-ranking-container');
    container.innerHTML = ''; // 清空

    if (!allResultsData || !allResultsData.modelRankings) {
        container.innerHTML = '<p>排名数据未加载</p>';
        return;
    }

    // 显示总排名
    const overallRanking = allResultsData.modelRankings['overall'];
    if (overallRanking && overallRanking.length > 0) {
        const overallDiv = document.createElement('div');
        overallDiv.className = 'ranking-item overall-ranking';
        overallDiv.innerHTML = `<strong>总排名:</strong> ${overallRanking.map((item, index) => `${index + 1}.${item.model}(${item.score})`).join(', ')}`;
        container.appendChild(overallDiv);
    }

    // 显示各噪声类型下的排名
    allResultsData.noiseTypes.forEach(noiseType => {
        if (noiseType === 'No_Attacking') return;
        const ranking = allResultsData.modelRankings[noiseType];
        if (ranking && ranking.length > 0) {
            const noiseDiv = document.createElement('div');
            noiseDiv.className = 'ranking-item';
            noiseDiv.innerHTML = `<strong>${noiseType}:</strong> ${ranking.map((item, index) => `${index + 1}.${item.model}(${item.score})`).join(', ')}`;
            container.appendChild(noiseDiv);
        }
    });
}

// 3.2 绘制模型鲁棒性折线图
function plotRobustness() {
    const container = document.getElementById('robustness-plot');
    if (!allResultsData) {
        container.innerHTML = '<p>数据未加载</p>';
        return;
    }

    const metric = 'Extract Accuracy'; // 假设查看准确率
    const traces = [];

    Object.keys(allResultsData.models).forEach(modelName => {
        const modelData = allResultsData.models[modelName];
        const xData = [];
        const yData = [];

        Object.keys(modelData.robustness).forEach(noiseType => {
            if (noiseType === 'No_Attacking') return;
            Object.keys(modelData.robustness[noiseType]).forEach(factor => {
                const metrics = modelData.robustness[noiseType][factor];
                if (metrics.hasOwnProperty(metric)) {
                    let value = metrics[metric];
                    if (Array.isArray(value)) {
                        value = value.reduce((a, b) => a + b, 0) / value.length;
                    }
                    xData.push(`${noiseType}(${factor})`);
                    yData.push(parseFloat(value));
                }
            });
        });

        traces.push({
            x: xData,
            y: yData,
            type: 'scatter',
            mode: 'lines+markers',
            name: modelName,
            line: { shape: 'linear' } // 或 'spline'
        });
    });

    const layout = {
        title: '模型在不同失真下的鲁棒性',
        xaxis: {
            title: '失真类型(因子)',
            tickangle: -45 // 旋转标签以避免重叠
        },
        yaxis: { title: metric },
        margin: { t: 30, l: 50, r: 30, b: 150 } // 增加底部和左侧边距
    };

    Plotly.newPlot(container, traces, layout);
}

// 3.3 绘制 PSNR vs 准确率 (由模型选择器触发)
function plotAttackEffectiveness(selectedModelName) {
    const container = document.getElementById('attack-effectiveness-plot');
    if (!allResultsData || !selectedModelName) {
        container.innerHTML = '<p>请选择一个模型</p>';
        return;
    }

    const modelData = allResultsData.models[selectedModelName];
    if (!modelData || !modelData.attackEffectiveness) {
        container.innerHTML = '<p>该模型无攻击效果数据</p>';
        return;
    }

    const traces = [];
    Object.keys(modelData.attackEffectiveness).forEach(noiseType => {
        const dataPoints = modelData.attackEffectiveness[noiseType];
        if (dataPoints.length > 0) {
            traces.push({
                x: dataPoints.map(dp => dp.vq_value), // PSNR
                y: dataPoints.map(dp => dp.robust_value), // Accuracy
                type: 'scatter',
                mode: 'lines+markers',
                name: noiseType,
                line: { shape: 'linear' }
            });
        }
    });

    const layout = {
        title: `${selectedModelName} - PSNR vs 提取准确率`,
        xaxis: { title: 'PSNR (dB)' },
        yaxis: { title: '提取准确率 (%)' },
        showlegend: true
    };

    Plotly.newPlot(container, traces, layout);
}


// --- 区域 4: 攻击器排名 ---
function initializeRegion4() {
    plotAttackerPerformance(); // 4.1
    // 4.2 将由模型选择器触发
}

// 4.1 绘制攻击器得分柱状图
function plotAttackerPerformance() {
    const container = document.getElementById('attacker-performance-plot');
    if (!allResultsData || !allResultsData.averageAttackerScores) {
        container.innerHTML = '<p>攻击器性能数据未加载</p>';
        return;
    }

    // 按得分排序
    const sortedAttackers = Object.entries(allResultsData.averageAttackerScores)
        .sort((a, b) => a[1] - b[1]); // 升序，得分低的攻击更强

    const xData = sortedAttackers.map(item => item[0]);
    const yData = sortedAttackers.map(item => item[1]);

    const trace = {
        x: xData,
        y: yData,
        type: 'bar',
        marker: {
            color: 'rgba(219, 64, 82, 0.7)',
            line: {
                color: 'rgba(219, 64, 82, 1.0)',
                width: 1
            }
        }
    };

    const layout = {
        title: '攻击器平均得分 (提取准确率)',
        xaxis: { title: '攻击器' },
        yaxis: { title: '平均准确率 (%)' },
        margin: { t: 30, l: 50, r: 30, b: 100 }
    };

    Plotly.newPlot(container, [trace], layout);
}

// 4.2 绘制噪声可视化 (Base64 图像) (由模型选择器触发)
function plotNoiseVisualizationPerModel(selectedModelName) {
    // 这个函数与 2.2 plotStegoVisualization 功能类似或相同
    // 因为都是显示选定模型的 base64 图像
    // 我们可以复用或稍作修改
    plotStegoVisualization(selectedModelName); // 暂时复用
    // 如果需要不同的展示方式，可以在这里实现
}


// --- 辅助函数 ---

// 填充模型选择器
function populateModelSelector() {
    const selector = document.getElementById('model-selector');
    selector.innerHTML = ''; // 清空

    if (!allResultsData) return;

    Object.keys(allResultsData.models).forEach(modelName => {
        const option = document.createElement('option');
        option.value = modelName;
        option.textContent = modelName;
        selector.appendChild(option);
    });

    // 添加事件监听器
    selector.addEventListener('change', function() {
        const selectedModel = this.value;
        plotStegoVisualization(selectedModel); // 区域 2.2
        plotAttackEffectiveness(selectedModel); // 区域 3.3
        plotNoiseVisualizationPerModel(selectedModel); // 区域 4.2
    });

    // 默认选择第一个模型并触发一次绘图
    if (selector.options.length > 0) {
        selector.selectedIndex = 0;
        selector.dispatchEvent(new Event('change'));
    }
}


// --- 页面加载完成后执行 ---
document.addEventListener('DOMContentLoaded', (event) => {
    loadData(DATA_URL);
});
