import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/ui/markdown';
import { Button } from '@/components/ui/button';
import { useSlidesList } from '@/lib/queries';

export function StudentPresentationViewerPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { courseId, presentationId } = useParams();
  const cId = courseId ?? '';
  const pId = presentationId ?? '';
  const slides = useSlidesList(pId);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = slides.data?.length ?? 0;
  const exit = useCallback(() => navigate(`/student/courses/${cId}`), [navigate, cId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(i + 1, Math.max(0, total - 1)));
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          exit();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void el.requestFullscreen();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, exit]);

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (dx < -40) setIndex((i) => Math.min(i + 1, Math.max(0, total - 1)));
    else if (dx > 40) setIndex((i) => Math.max(i - 1, 0));
    touchStartX.current = null;
  };

  const slide = slides.data?.[index];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between px-4 py-2 text-xs text-white/60">
        <span>
          {total > 0 ? `${index + 1} / ${total}` : t('common.loading')}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exit}>
            {t('common.back')}
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-8">
        {slides.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : total === 0 ? (
          <p>{t('slides.empty')}</p>
        ) : slide ? (
          <div className="max-w-3xl text-lg prose prose-invert">
            {slide.title ? <h1 className="mb-6">{slide.title}</h1> : null}
            <Markdown source={slide.content ?? ''} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-xs text-white/60">
        <Button
          size="sm"
          variant="outline"
          disabled={index <= 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          ←
        </Button>
        <span className="hidden sm:inline">{t('slides.viewerHint')}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={index >= total - 1}
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
        >
          →
        </Button>
      </div>
    </div>
  );
}
