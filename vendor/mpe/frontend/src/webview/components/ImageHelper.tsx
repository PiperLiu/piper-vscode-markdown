import React from 'react';
import PreviewContainer from '../containers/preview';
export default function ImageHelper() {
  const { showImageHelper, setShowImageHelper, postMessage, config } =
    PreviewContainer.useContainer();
  if (!showImageHelper) return null;
  const zh = String(config.locale || 'en').startsWith('zh');
  const act = (kind: string) => {
    setShowImageHelper(false);
    postMessage('piperPublishing', [{ action: 'insertImage', kind }]);
  };
  return (
    <dialog open className="modal" onCancel={() => setShowImageHelper(false)}>
      <div className="modal-box">
        <h3>{zh ? '插入图片' : 'Insert image'}</h3>
        <button className="btn" onClick={() => act('file')}>
          {zh ? '选择本地图片' : 'Choose local image'}
        </button>
        <button className="btn" onClick={() => act('link')}>
          {zh ? '插入图片链接' : 'Insert image link'}
        </button>
        <button
          className="btn"
          onClick={() => {
            setShowImageHelper(false);
            postMessage('piperPublishing', [{ action: 'configureHost' }]);
          }}
        >
          {zh ? '发布图床设置' : 'Publishing image host'}
        </button>
        <button className="btn" onClick={() => setShowImageHelper(false)}>
          {zh ? '关闭' : 'Close'}
        </button>
      </div>
    </dialog>
  );
}
