// js/charts/attack-charts.js
// 攻击图表渲染模块
// attack-charts.js

// 预定义颜色数组（替代 Plotly.d3.scale.category10()）
const ATTACK_CHART_COLORS = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
];

// 颜色获取函数
function getAttackChartColor(index) {
    if (index < ATTACK_CHART_COLORS.length) {
        return ATTACK_CHART_COLORS[index];
    } else {
        // 生成新颜色（简单的彩虹色算法）
        const hue = (index * 137.508) % 360; // 黄金角度
        return `hsl(${hue}, 70%, 50%)`;
    }
}

// 创建模拟的 d3 对象来避免错误
if (typeof Plotly !== 'undefined' && !Plotly.d3) {
    Plotly.d3 = {
        scale: {
            category10: function() {
                return function(index) {
                    return getAttackChartColor(index);
                };
            }
        }
    };
}
/**
 * 渲染攻击有效性柱状图 (区域 4 子部分 1)
 * @param {Array} modelsData - 模型数据数组
 */
function renderAttackEffectivenessChart(modelsData) {

    const container = document.getElementById('attack-effectiveness-chart');
    if (!container) return;

    // 计算E分数
    const EScores = DataProcessor.computeEScores(modelsData);

    // 计算平均E分数（每个噪声类型跨所有模型）
    const avgEScores = {};
    for (const [noiseType, noiseData] of Object.entries(EScores)) {
        if (noiseType === 'No Attacking') continue;

        const allScores = [];
        for (const scores of Object.values(noiseData)) {
            allScores.push(...scores);
        }

        if (allScores.length > 0) {
            avgEScores[noiseType] = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
        } else {
            avgEScores[noiseType] = 0;
        }
    }

    if (Object.keys(avgEScores).length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No attack effectiveness data available</p>';
        return;
    }

    // 按平均E分数排序（高分在前）
    const sortedNoiseTypes = Object.keys(avgEScores).sort(
        (a, b) => avgEScores[b] - avgEScores[a]
    );

    const noiseTypes = sortedNoiseTypes;
    const eScores = sortedNoiseTypes.map(nt => avgEScores[nt]);
    const rankings = sortedNoiseTypes.map((_, i) => i + 1);

    // ✅ 修复：使用 noiseTypes 的长度来生成颜色，而不是未定义的 modelNames
    const colors = noiseTypes.map((_, i) => getAttackChartColor(i));

    // 创建水平柱状图数据
    const trace = {
        x: eScores,
        y: noiseTypes,
        type: 'bar',
        orientation: 'h',
        marker: {
            color: colors
        },
        text: eScores.map(score => (score || 0).toFixed(3)),
        textposition: 'auto'
    };

    const layout = {
        title: 'Attack Effectiveness Ranking',
        xaxis: {
            title: 'Average Attack Effectiveness Score (E Score)'
        },
        yaxis: {
            title: 'Attack Type',
            automargin: true
        },
        margin: {
            l: 150, // 增加左侧边距以容纳标签
            r: 20,
            b: 50,
            t: 50,
            pad: 4
        }
    };

    const config = {
        responsive: true,
        displayModeBar: true
    };

    // 检查Plotly是否可用
    if (typeof Plotly === 'undefined') {
        console.warn('Plotly not loaded yet for attack chart, retrying in 500ms...');
        setTimeout(() => {
            renderAttackEffectivenessChart(modelsData);
        }, 500);
        return;
    }
    
    Plotly.newPlot(container, [trace], layout, config);
}

window.renderAttackEffectivenessChart = renderAttackEffectivenessChart;