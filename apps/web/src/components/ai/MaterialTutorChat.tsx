import { useTranslation } from 'react-i18next';
import { AiChatBubble } from '@/components/ai/AiChatBubble';
import { sendTutorMessage } from '@/lib/queries';

/**
 * Material-tutor binding for the generic AiChatBubble: supplies the tutor
 * copy and points `send` at this material's tutor endpoint. Mount with
 * `key={materialId}` so navigating between materials resets the chat.
 */
export function MaterialTutorChat({ materialId }: { materialId: string }): JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <AiChatBubble
      title={t('aiTutor.title')}
      badge={t('aiTutor.freeBeta')}
      welcome={t('aiTutor.welcome')}
      placeholder={t('aiTutor.inputPlaceholder')}
      disclaimer={t('aiTutor.disclaimer')}
      openLabel={t('aiTutor.open')}
      thinkingLabel={t('aiTutor.thinking')}
      send={(message, history) => sendTutorMessage(materialId, message, history, i18n.language)}
    />
  );
}
