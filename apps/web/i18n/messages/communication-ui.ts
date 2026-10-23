export const communicationUiEn = {
  "adminScope": "School communications — choose audiences and Classes or the whole School before publishing.",
  "teacherScope": "Class communications — only your assigned Classes are available.",
  "steps": "1. Write a draft · 2. Choose recipients · 3. Review and publish",
  "draftHelp": "Saving creates unpublished content. Choose recipients and confirm publication separately.",
  "targetsSaved": "Recipient scope updated. Review the targets below before publishing.",
  "targetsLoading": "Loading recipient scope…",
  "targetsUnavailable": "Recipient scope could not be loaded.",
  "retry": "Try again",
  "frozen": "This version is linked to a publication. Its recipient scope is locked; content corrections use a new version.",
  "unpublished": "This version has not been published to recipients.",
  "recipientHelp": "Only publications addressed to you appear here. Open a message to read its preserved content.",
  "readHelp": "Opening a notification does not mark it as read. Use the read action when you are ready.",
  "publishedAt": "Published",
  "technicalDetails": "Publication details",
  "exactTimestamp": "Exact timestamp (UTC)",
  "utc": "UTC"
} as const;

export const communicationUiFr = {
  "adminScope": "Communications de l’école — choisissez les destinataires et les classes ou toute l’école avant de publier.",
  "teacherScope": "Communications de classe — seules vos classes attribuées sont disponibles.",
  "steps": "1. Rédiger · 2. Choisir les destinataires · 3. Vérifier et publier",
  "draftHelp": "L’enregistrement crée un contenu non publié. Choisissez les destinataires et confirmez la publication séparément.",
  "targetsSaved": "Destinataires mis à jour. Vérifiez les cibles ci-dessous avant de publier.",
  "targetsLoading": "Chargement des destinataires…",
  "targetsUnavailable": "Impossible de charger les destinataires.",
  "retry": "Réessayer",
  "frozen": "Cette version est liée à une publication. Ses destinataires sont verrouillés ; les corrections de contenu utilisent une nouvelle version.",
  "unpublished": "Cette version n’a pas été publiée auprès des destinataires.",
  "recipientHelp": "Seules les publications qui vous sont adressées apparaissent ici. Ouvrez un message pour lire son contenu conservé.",
  "readHelp": "Ouvrir une notification ne la marque pas comme lue. Utilisez l’action de lecture lorsque vous le souhaitez.",
  "publishedAt": "Publié le",
  "technicalDetails": "Détails de la publication",
  "exactTimestamp": "Horodatage exact (UTC)",
  "utc": "UTC"
} satisfies Record<keyof typeof communicationUiEn, string>;

export const communicationUiAr = {
  "adminScope": "مراسلات المدرسة — اختر الجمهور والأقسام أو المدرسة بأكملها قبل النشر.",
  "teacherScope": "مراسلات القسم — تتوفر فقط الأقسام المسندة إليك.",
  "steps": "1. كتابة مسودة · 2. اختيار المستلمين · 3. المراجعة والنشر",
  "draftHelp": "ينشئ الحفظ محتوى غير منشور. اختر المستلمين وأكد النشر بشكل منفصل.",
  "targetsSaved": "تم تحديث نطاق المستلمين. راجع الأهداف أدناه قبل النشر.",
  "targetsLoading": "جارٍ تحميل نطاق المستلمين…",
  "targetsUnavailable": "تعذر تحميل نطاق المستلمين.",
  "retry": "إعادة المحاولة",
  "frozen": "هذه النسخة مرتبطة بمنشور. نطاق مستلميها مقفل؛ وتستخدم تصحيحات المحتوى نسخة جديدة.",
  "unpublished": "لم تُنشر هذه النسخة للمستلمين.",
  "recipientHelp": "تظهر هنا المنشورات الموجهة إليك فقط. افتح الرسالة لقراءة محتواها المحفوظ.",
  "readHelp": "فتح الإشعار لا يجعله مقروءًا. استخدم إجراء القراءة عندما تكون مستعدًا.",
  "publishedAt": "تاريخ النشر",
  "technicalDetails": "تفاصيل المنشور",
  "exactTimestamp": "الطابع الزمني الدقيق (UTC)",
  "utc": "UTC"
} satisfies Record<keyof typeof communicationUiEn, string>;
