import type { Messages } from '../catalogs';

const messages = {
  foundation: {
    appName: 'Madrasio',
    actions: {
      save: 'حفظ',
      cancel: 'إلغاء',
      close: 'إغلاق',
      retry: 'إعادة المحاولة',
    },
    greeting: 'مرحبًا، {name}!',
  },
} as const satisfies Messages;

export default messages;
