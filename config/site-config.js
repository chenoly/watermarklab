// watermarklab-website/config/site-config.js
const siteConfig = {
    theme: {
        primaryColor: "#007bff",
        secondaryColor: "#6c757d",
        backgroundColor: "#f8f9fa",
        accentColor: "#17a2b8"
    },
    animations: {
        floatSpeed: 6000,
        transitionDuration: 300
    },
    apiUrl: "https://api.watermarklab.com",
    defaultModels: ["hinet", "stegastamp"],
    chartSettings: {
        defaultHeight: 400,
        defaultWidth: 600,
        colors: ["#007bff", "#28a745", "#dc3545", "#ffc107", "#17a2b8"]
    }
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = siteConfig;
} else {
    window.siteConfig = siteConfig;
}