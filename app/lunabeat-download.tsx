"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const DOWNLOAD_OPTIONS = [
  {
    title: "去 GitHub 下载",
    detail: "查看 LunaBeat 的正式版本",
    href: "https://github.com/2755337087/LunaBeat/releases",
    tag: "GITHUB",
  },
  {
    title: "去蓝奏云下载",
    detail: "访问密码：5m2k",
    href: "https://hbhb.lanzouw.com/b0xx39sfc",
    tag: "蓝奏云",
  },
  {
    title: "去 QQ 群下载",
    detail: "加入 QQ 群获取安装包",
    href: "https://qm.qq.com/q/n5C4EGFwno",
    tag: "QQ 群",
  },
];

export function LunaBeatDownload() {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const triggerButton = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      triggerButton?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <section className="lunabeat-promo" aria-labelledby="lunabeat-title">
        <div className="lunabeat-info">
          <span className="lunabeat-logo-wrap" aria-hidden="true">
            <Image
              className="lunabeat-logo"
              src={`${basePath}/lunabeat_logo.svg`}
              alt=""
              width={72}
              height={72}
              unoptimized
            />
          </span>
          <div className="lunabeat-copy">
            <span className="lunabeat-kicker">播放器 · 元数据 · 歌词编辑</span>
            <h2 id="lunabeat-title">用 LunaBeat 播放和编辑你的音乐</h2>
            <p>LunaBeat 是一款集音乐播放、元数据编辑与歌词编辑功能于一体的播放器。</p>
          </div>
        </div>
        <button
          ref={triggerRef}
          className="lunabeat-trigger"
          type="button"
          onClick={() => setIsOpen(true)}
          aria-haspopup="dialog"
        >
          下载 LunaBeat
          <span aria-hidden="true">↗</span>
        </button>
      </section>

      {isOpen && (
        <div
          className="download-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            className="download-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-modal-title"
          >
            <div className="download-modal-head">
              <div className="download-modal-title-group">
                <Image
                  className="download-modal-logo"
                  src={`${basePath}/lunabeat_logo.svg`}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                />
                <div>
                <span className="download-modal-kicker">LUNABEAT</span>
                <h2 id="download-modal-title">选择下载方式</h2>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                className="download-modal-close"
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="关闭下载窗口"
              >
                ×
              </button>
            </div>

            <div className="download-options">
              {DOWNLOAD_OPTIONS.map((option) => (
                <a
                  className="download-option"
                  href={option.href}
                  target="_blank"
                  rel="noreferrer"
                  key={option.href}
                >
                  <span className="download-option-tag">{option.tag}</span>
                  <span className="download-option-copy">
                    <b>{option.title}</b>
                    <small>{option.detail}</small>
                  </span>
                  <span className="download-option-arrow" aria-hidden="true">↗</span>
                </a>
              ))}
            </div>

            <p className="download-modal-note">
              蓝奏云下载密码：<strong>5m2k</strong>
            </p>
          </section>
        </div>
      )}
    </>
  );
}
