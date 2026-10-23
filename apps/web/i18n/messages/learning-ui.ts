export const learningUiEn = {
  "grades": "Choose the exact year, period, Class and Subject. Record grades from a published assessment in an open gradebook.",
  "results": "Calculate, review, finalize, then publish explicitly. Parents see immutable published snapshots, not working results.",
  "teacherResults": "Review and calculate Subject results within your teaching scope. School administrators control finalization and publication.",
  "homework": "Create a draft, choose its authorized Classes, then publish. Track hand-ins and review each submission separately.",
  "entry": "Only changed students are saved. Saving grades does not calculate or publish results.",
  "saving": "Saving…",
  "unsaved": "Unsaved changes",
  "working": "Working result — publication is a separate step"
} as const;

export const learningUiFr = {
  "grades": "Choisissez l’année, la période, la classe et la matière exactes. Saisissez les notes d’une évaluation publiée dans un carnet ouvert.",
  "results": "Calculez, vérifiez, finalisez, puis publiez explicitement. Les parents voient les instantanés publiés, pas les résultats de travail.",
  "teacherResults": "Consultez et calculez les résultats par matière dans votre périmètre. La direction contrôle la finalisation et la publication.",
  "homework": "Créez un brouillon, choisissez les classes autorisées, puis publiez. Suivez les remises et examinez chaque travail séparément.",
  "entry": "Seuls les élèves modifiés sont enregistrés. Enregistrer les notes ne calcule ni ne publie les résultats.",
  "saving": "Enregistrement…",
  "unsaved": "Modifications non enregistrées",
  "working": "Résultat de travail — la publication est une étape distincte"
} satisfies Record<keyof typeof learningUiEn, string>;

export const learningUiAr = {
  "grades": "اختر السنة والفترة والقسم والمادة بدقة. أدخل النقط لتقييم منشور في دفتر نقط مفتوح.",
  "results": "احسب وراجع واعتمد، ثم انشر صراحةً. يرى أولياء الأمور النسخ المنشورة المحفوظة وليس نتائج العمل.",
  "teacherResults": "راجع واحسب نتائج المواد ضمن نطاق تكليفك. تتحكم إدارة المدرسة في الاعتماد والنشر.",
  "homework": "أنشئ مسودة واختر الأقسام المصرح بها، ثم انشرها. تتبع التسليمات وراجع كل عمل على حدة.",
  "entry": "يُحفظ التلاميذ الذين عُدّلت بياناتهم فقط. حفظ النقط لا يحسب النتائج ولا ينشرها.",
  "saving": "جارٍ الحفظ…",
  "unsaved": "تغييرات غير محفوظة",
  "working": "نتيجة عمل — النشر خطوة منفصلة"
} satisfies Record<keyof typeof learningUiEn, string>;
