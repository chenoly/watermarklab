// watermarklab-website/js/utils/modal.js
// 现代化Modal组件

function showModalAlert(title, message, callback = null, showCancel = true) {
    // 创建背景遮罩
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    // 创建modal容器
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';

    // 创建modal内容
    modalContainer.innerHTML = `
        <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <p class="modal-message">${message}</p>
        </div>
        <div class="modal-footer">
            <button class="btn btn-primary modal-confirm-btn">OK</button>
        </div>
    `;

    // 添加到页面
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // 添加样式
    addModalStyles();

    // 显示动画
    setTimeout(() => {
        modalOverlay.classList.add('show');
        modalContainer.classList.add('show');
    }, 10);

    // 关闭函数
    function closeModal() {
        modalOverlay.classList.remove('show');
        modalContainer.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(modalOverlay);
            if (callback) callback();
        }, 300);
    }

    // 绑定事件
    const closeBtn = modalContainer.querySelector('.modal-close-btn');
    const confirmBtn = modalContainer.querySelector('.modal-confirm-btn');

    closeBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', closeModal);

    // 点击背景关闭
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // ESC键关闭
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function addModalStyles() {
    // 检查是否已经添加过样式
    if (document.getElementById('modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }
        
        .modal-overlay.show {
            opacity: 1;
            pointer-events: all;
        }
        
        .modal-container {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border-radius: 15px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 400px;
            max-height: 90vh;
            overflow: hidden;
            transform: scale(0.7);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            opacity: 0;
        }
        
        .modal-container.show {
            transform: scale(1);
            opacity: 1;
        }
        
        .modal-header {
            padding: 20px 20px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        
        .modal-title {
            color: #007bff;
            font-size: 1.3rem;
            font-weight: 600;
            margin: 0;
        }
        
        .modal-close-btn {
            background: none;
            border: none;
            font-size: 1.8rem;
            color: #6c757d;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        }
        
        .modal-close-btn:hover {
            background-color: rgba(0, 0, 0, 0.05);
            color: #000;
        }
        
        .modal-body {
            padding: 20px;
        }
        
        .modal-message {
            color: #333;
            font-size: 1rem;
            line-height: 1.5;
            margin: 0;
            text-align: center;
        }
        
        .modal-footer {
            padding: 15px 20px 20px;
            display: flex;
            justify-content: center;
        }
        
        .btn-primary {
            padding: 10px 25px;
            border: 1.5px solid #007bff;
            border-radius: 32px;
            font-size: 1rem;
            font-weight: 600;
            background: linear-gradient(135deg, #007bff 0%, #17a2b8 100%);
            color: white;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 15px rgba(0,123,255,0.2);
        }
        
        .btn-primary:hover {
            box-shadow: 0 8px 25px rgba(0,123,255,0.3);
            transform: translateY(-2px);
        }
        
        .btn-primary:active {
            transform: scale(0.98);
        }
        
        @media (max-width: 480px) {
            .modal-container {
                width: 95%;
                margin: 20px;
            }
            
            .modal-title {
                font-size: 1.1rem;
            }
            
            .modal-message {
                font-size: 0.9rem;
            }
        }
    `;

    document.head.appendChild(style);
}

// 确保全局可用
window.showModalAlert = showModalAlert;