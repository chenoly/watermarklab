// 视觉质量图表渲染模块

/**
 * 渲染视觉质量指标图表 (区域 2 子部分 1)
 * @param {Array} modelsData - 模型数据数组
 */
function renderVisualQualityCharts(modelsData) {
    // 提取多值指标数据
    const metricsData = DataProcessor.extractMultiValueMetrics(modelsData);

    // 提取FID数据
    const fidData = DataProcessor.extractFidData(modelsData);

    // 获取一致的颜色方案
    const allModelNames = modelsData.map(model => model.modelname);
    const modelColors = DataProcessor.getConsistentColors(allModelNames);

    // 获取所有测试指标（从第一个模型获取，假设所有模型测试相同指标）
    const allTestedMetrics = modelsData.length > 0 ? 
        (modelsData[0].testvisualqualitymetrics || []) : [];
    
    console.log('Detected Visual Quality Metrics:', allTestedMetrics);
    console.log('Available Metrics Data:', Object.keys(metricsData));

    // 动态清空并重建图表容器
    const vqChartsContainer = document.getElementById('vq-charts');
    if (vqChartsContainer) {
        vqChartsContainer.innerHTML = ''; // 清空现有内容
        
        // 为每个测试指标创建图表容器
        allTestedMetrics.forEach(metric => {
            if (metricsData[metric] && Object.keys(metricsData[metric]).length > 0) {
                // 创建图表包装容器
                const chartWrapper = document.createElement('div');
                chartWrapper.className = 'chart-wrapper';
                
                // 创建图表容器
                const chartContainer = document.createElement('div');
                const chartId = `${metric.toLowerCase().replace(/[^a-z0-9]/g, '-')}-chart`;
                chartContainer.id = chartId;
                chartContainer.className = 'chart-container';
                
                chartWrapper.appendChild(chartContainer);
                vqChartsContainer.appendChild(chartWrapper);
                
                // 渲染小提琴图
                console.log(`Rendering chart for metric: ${metric}`);
                safeRenderChart(renderViolinPlot, chartId, metricsData[metric], metric, modelColors);
            }
        });
        
        // 处理FID图表（特殊情况）
        if (Object.keys(fidData).length > 0) {
            // 创建FID图表容器
            const fidChartWrapper = document.createElement('div');
            fidChartWrapper.className = 'chart-wrapper';
            
            const fidChartContainer = document.createElement('div');
            fidChartContainer.id = 'fid-chart';
            fidChartContainer.className = 'chart-container';
            
            fidChartWrapper.appendChild(fidChartContainer);
            vqChartsContainer.appendChild(fidChartWrapper);
            
            console.log('Rendering FID chart');
            safeRenderChart(renderFidBarChart, 'fid-chart', fidData, modelColors);
        }
    }
    
    // 如果没有找到任何数据，显示提示信息
    if (allTestedMetrics.length === 0 && Object.keys(fidData).length === 0) {
        if (vqChartsContainer) {
            vqChartsContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 50px;">No visual quality metrics data available.</p>';
        }
    }
}

/**
 * 安全的图表渲染函数
 */
function safeRenderChart(renderFunc, containerId, ...args) {
    if (typeof Plotly === 'undefined') {
        console.warn(`Plotly not loaded yet for ${containerId}, retrying in 500ms...`);
        setTimeout(() => {
            safeRenderChart(renderFunc, containerId, ...args);
        }, 500);
        return;
    }
    renderFunc(containerId, ...args);
}

/**
 * 渲染小提琴图
 * @param {string} containerId - 图表容器ID
 * @param {Object} metricData - 指标数据 {model_name: [values]}
 * @param {string} metricName - 指标名称
 * @param {Object} modelColors - 模型颜色映射
 */
function renderViolinPlot(containerId, metricData, metricName, modelColors) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 准备数据
    const modelNames = Object.keys(metricData);
    const data = modelNames.map(modelName => ({
        type: 'violin',
        name: modelName,
        y: metricData[modelName],
        points: 'outliers', // 显示异常值点
        pointpos: 0, // 点的位置在中心
        jitter: 0.3, // 点的抖动
        width: 0.6, // 控制小提琴图宽度
        box: {
            visible: true, // 显示箱线图（中位数、四分位数）
            width: 0.3, // 箱线图宽度
            fillcolor: 'rgba(255, 255, 255, 0.8)', // 箱线图填充色
            line: {
                color: modelColors[modelName],
                width: 1.5
            }
        },
        line: {
            color: modelColors[modelName],
            width: 2 // 边界线宽度
        },
        fillcolor: modelColors[modelName],
        opacity: 0.6, // 轻微降低透明度以更好显示内部统计信息
        meanline: {
            visible: true, // 显示均值线
            color: 'red', // 红色均值线
            width: 2 // 均值线宽度
        },
        // 增强统计信息显示
        bandwidth: null, // 自动带宽
        scalemode: 'count', // 按数量缩放
        side: 'both', // 双侧显示
        spanmode: 'hard', // 使用硬边界
        text: modelName, // 添加文本标签
        hovertemplate: '<b>%{text}</b><br>' +
                      '%{yaxis.title.text}: %{y}<br>' +
                      'Count: %{kde}<br>' + // 显示密度信息
                      '<extra></extra>', // 自定义悬停信息
        yaxis: 'y'
    }));

    const layout = {
        title: {
            text: `${metricName} Distribution`,
            font: { size: 18, color: '#34495e' }
        },
        yaxis: {
            title: {
                text: metricName,
                font: { size: 16, color: '#34495e' }
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)',
            showgrid: true, // 显示网格
            gridwidth: 1,
            zeroline: true, // 显示零线
            zerolinecolor: '#d0d0d0', // 零线颜色
            zerolinewidth: 1,
            tickfont: { size: 12 }
        },
        xaxis: {
            title: {
                text: 'Models',
                font: { size: 16, color: '#34495e' }
            },
            tickfont: { size: 12, color: '#2c3e50' },
            tickangle: -45, // 明确设置所有标签倾斜45度
            showticklabels: true, // 确保显示标签
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加X轴网格线
            showgrid: true, // 显示网格
            zeroline: true, // 显示零线
            zerolinecolor: '#d0d0d0', // 零线颜色
            automargin: true // 自动调整边距以适应标签
        },
        margin: {
            l: 60,
            r: 20,
            b: 120, // 增加底部边距以适应倾斜标签
            t: 60,
            pad: 4
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)',
        height: 450, // 统一图表高度
        width: null, // 自适应宽度
        violingap: 0.3, // 控制小提琴图之间的间距
        autosize: true, // 启用自适应布局
        showlegend: true, // 显示图例
        legend: {
            orientation: 'h', // 水平排列
            x: 0.5, // 居中显示
            y: -0.25, // 位于图表下方
            xanchor: 'center',
            yanchor: 'top',
            font: {
                size: 11,
                color: '#2c3e50'
            }
        },
        font: {
            family: 'Arial, sans-serif',
            size: 12,
            color: '#2c3e50'
        }
    };

    const config = {
        responsive: true,
        displayModeBar: true
    };

    Plotly.newPlot(container, data, layout, config);
}

/**
 * 渲染FID分组条形图
 * @param {string} containerId - 图表容器ID
 * @param {Object} fidData - FID数据 {model_name: {stego_fid, clean_fid}}
 * @param {Object} modelColors - 模型颜色映射
 */
function renderFidBarChart(containerId, fidData, modelColors) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 准备数据
    const modelNames = Object.keys(fidData);
    const stegoFids = modelNames.map(name => fidData[name].stego_fid);
    const cleanFids = modelNames.map(name => fidData[name].clean_fid);

    const hasCleanData = cleanFids.some(fid => fid !== null && fid !== undefined);

    const data = [{
        type: 'bar',
        name: 'Stego FID',
        x: modelNames,
        y: stegoFids,
        marker: {
            color: modelNames.map(name => modelColors[name]),
            line: {
                color: 'rgba(255, 255, 255, 0.8)',
                width: 2
            },
            opacity: 0.9
        }
    }];

    if (hasCleanData) {
        data.push({
            type: 'bar',
            name: 'Clean FID',
            x: modelNames,
            y: cleanFids.map(fid => fid !== null && fid !== undefined ? fid : 0),
            marker: {
                color: modelNames.map(name => modelColors[name]),
                pattern: {
                    shape: '/', // 斜线填充区分
                    bgcolor: 'rgba(255, 255, 255, 0.3)',
                    fgcolor: modelNames.map(name => modelColors[name]),
                    size: 8,
                    solidity: 0.3
                },
                line: {
                    color: 'rgba(255, 255, 255, 0.8)',
                    width: 2
                },
                opacity: 0.9
            }
        });
    }

    const layout = {
        title: {
            text: 'FID Scores',
            font: { size: 18, color: '#34495e' }
        },
        barmode: 'group',
        xaxis: {
            title: {
                text: 'Models',
                font: { size: 16, color: '#34495e' }
            },
            showticklabels: true,
            tickangle: -45, // 明确设置所有标签倾斜45度
            tickfont: { size: 12, color: '#2c3e50' },
            gridcolor: 'rgba(52, 73, 94, 0.1)', // 添加X轴网格线
            showgrid: true, // 显示网格
            automargin: true // 自动调整边距以适应标签
        },
        yaxis: {
            title: {
                text: 'FID Score',
                font: { size: 16, color: '#34495e' }
            },
            gridcolor: 'rgba(52, 73, 94, 0.1)',
            showgrid: true, // 显示网格
            gridwidth: 1,
            tickfont: { size: 12 }
        },
        margin: {
            l: 60,
            r: 20,
            b: 120, // 增加底部边距以适应倾斜标签
            t: 60,
            pad: 4
        },
        plot_bgcolor: 'rgba(173, 216, 230, 0.3)', // 淡蓝色底色
        paper_bgcolor: 'rgba(255, 255, 255, 0.95)',
        height: 450, // 统一图表高度与小提琴图保持一致
        width: null, // 自适应宽度
        font: {
            family: 'Arial, sans-serif',
            size: 12,
            color: '#2c3e50'
        }
    };

    const config = {
        responsive: true,
        displayModeBar: true
    };

    Plotly.newPlot(container, data, layout, config);
}

// 暴露函数到全局作用域
window.renderVisualQualityCharts = renderVisualQualityCharts;