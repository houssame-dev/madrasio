export const globalSearchEn = {
  open: 'Search Madrasio', placeholder: 'Search Madrasio…', title: 'Search', close: 'Close search',
  all: 'All', pages: 'Pages', students: 'Students', teachers: 'Teachers', parents: 'Parents', classes: 'Classes', children: 'My children',
  quick: 'Quick navigation', destination: 'Open authorized destination', loading: 'Searching your school…',
  empty: 'No matching results', emptyHint: 'Try another name, student code or page title.',
  error: 'Search is temporarily unavailable', errorHint: 'Your current page is unchanged. Try again.', retry: 'Retry search',
  minimum: 'Enter at least 2 characters to search authorized records.', privacy: 'Search only authorized school data.',
  navigate: 'Navigate', activate: 'Open', dismiss: 'Close', filters: 'Search categories',
} as const;
export const globalSearchFr: Record<keyof typeof globalSearchEn, string> = {
  open: 'Rechercher dans Madrasio', placeholder: 'Rechercher dans Madrasio…', title: 'Recherche', close: 'Fermer la recherche',
  all: 'Tout', pages: 'Pages', students: 'Élèves', teachers: 'Enseignants', parents: 'Parents', classes: 'Classes', children: 'Mes enfants',
  quick: 'Navigation rapide', destination: 'Ouvrir une destination autorisée', loading: 'Recherche dans votre école…',
  empty: 'Aucun résultat correspondant', emptyHint: 'Essayez un autre nom, code élève ou titre de page.',
  error: 'La recherche est temporairement indisponible', errorHint: 'Votre page actuelle est inchangée. Réessayez.', retry: 'Réessayer',
  minimum: 'Saisissez au moins 2 caractères pour rechercher des dossiers autorisés.', privacy: 'Recherchez uniquement les données scolaires autorisées.',
  navigate: 'Naviguer', activate: 'Ouvrir', dismiss: 'Fermer', filters: 'Catégories de recherche',
};
export const globalSearchAr: Record<keyof typeof globalSearchEn, string> = {
  open: 'البحث في مدراسيو', placeholder: 'ابحث في مدراسيو…', title: 'البحث', close: 'إغلاق البحث',
  all: 'الكل', pages: 'الصفحات', students: 'الطلاب', teachers: 'المعلمون', parents: 'أولياء الأمور', classes: 'الأقسام', children: 'أطفالي',
  quick: 'التنقل السريع', destination: 'فتح وجهة مسموح بها', loading: 'جارٍ البحث في مدرستك…',
  empty: 'لا توجد نتائج مطابقة', emptyHint: 'جرّب اسماً آخر أو رمز طالب أو عنوان صفحة.',
  error: 'البحث غير متاح مؤقتاً', errorHint: 'صفحتك الحالية لم تتغير. حاول مجدداً.', retry: 'إعادة البحث',
  minimum: 'أدخل حرفين على الأقل للبحث في السجلات المسموح بها.', privacy: 'ابحث فقط في بيانات المدرسة المسموح بها.',
  navigate: 'التنقل', activate: 'فتح', dismiss: 'إغلاق', filters: 'فئات البحث',
};
