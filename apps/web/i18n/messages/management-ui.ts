export const managementUiEn = {
  "years": "Start with academic years and their periods. Review dates and lifecycle states before making changes.",
  "structure": "Organize Stages and Levels first. Each Level belongs to its existing Stage.",
  "tracks": "Maintain the school’s tracks and their display order. Lifecycle changes preserve existing records.",
  "subjects": "Maintain the subject directory here. Coefficients belong to curriculum versions, not to subject profiles.",
  "curricula": "Open a curriculum to review its versions, then manage the subjects in an editable draft.",
  "classes": "Review each Class within its academic year, Level, Track and curriculum version.",
  "students": "Student profiles and academic enrollment are separate. Open a profile to review placement and enrollment history.",
  "teachers": "Teacher profiles, account access and academic assignments are separate. Open a profile to review each area.",
  "parents": "Parent profiles and child relationships are separate. Open a profile to review account access and link eligible children."
} as const;

export const managementUiFr = {
  "years": "Commencez par les années scolaires et leurs périodes. Vérifiez les dates et les états avant toute modification.",
  "structure": "Organisez d’abord les cycles et les niveaux. Chaque niveau reste rattaché à son cycle existant.",
  "tracks": "Gérez les filières et leur ordre d’affichage. Les changements d’état préservent les données existantes.",
  "subjects": "Gérez ici le répertoire des matières. Les coefficients appartiennent aux versions des programmes.",
  "curricula": "Ouvrez un programme pour consulter ses versions, puis gérez les matières d’un brouillon modifiable.",
  "classes": "Consultez chaque classe dans son année scolaire, son niveau, sa filière et sa version de programme.",
  "students": "Le profil et l’inscription scolaire sont distincts. Ouvrez un profil pour consulter l’affectation et l’historique des inscriptions.",
  "teachers": "Le profil, l’accès au compte et les affectations pédagogiques sont distincts. Ouvrez un profil pour les consulter.",
  "parents": "Le profil et les liens avec les enfants sont distincts. Ouvrez un profil pour consulter le compte et lier les enfants éligibles."
} satisfies Record<keyof typeof managementUiEn, string>;

export const managementUiAr = {
  "years": "ابدأ بالسنوات الدراسية وفتراتها. راجع التواريخ والحالات قبل إجراء أي تعديل.",
  "structure": "نظّم المراحل والمستويات أولاً. يحتفظ كل مستوى بارتباطه بمرحلته الحالية.",
  "tracks": "أدر مسالك المدرسة وترتيب عرضها. تحافظ تغييرات الحالة على السجلات الحالية.",
  "subjects": "أدر دليل المواد هنا. ترتبط المعاملات بنسخ المناهج وليس بملفات المواد.",
  "curricula": "افتح منهجاً لمراجعة نسخه، ثم أدر المواد في مسودة قابلة للتعديل.",
  "classes": "راجع كل قسم ضمن سنته الدراسية ومستواه ومسلكه ونسخة منهجه.",
  "students": "ملف التلميذ منفصل عن التسجيل الدراسي. افتح الملف لمراجعة القسم وسجل التسجيلات.",
  "teachers": "ملف الأستاذ والوصول إلى الحساب والتكليفات الدراسية منفصلة. افتح الملف لمراجعة كل منها.",
  "parents": "ملف ولي الأمر منفصل عن علاقاته بالأبناء. افتح الملف لمراجعة الحساب وربط الأبناء المؤهلين."
} satisfies Record<keyof typeof managementUiEn, string>;
