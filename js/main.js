// watermarklab-website/js/main.js
// 主JavaScript文件

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('WatermarkLab website loaded');

    // 页面过渡动画
    const pageContainer = document.querySelector('.page-container') ||
                         document.querySelector('.home-container') ||
                         document.querySelector('.visualization-container');

    if (pageContainer) {
        pageContainer.classList.add('page-transition');
    }

    // 返回按钮事件
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.history.back();
        });
    }
});

// 平滑滚动
function smoothScrollTo(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 页面切换动画
function navigateTo(url) {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
        window.location.href = url;
    }, 300);
}