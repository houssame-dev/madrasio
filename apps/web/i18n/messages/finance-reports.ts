export const reportsEn = {
  title: 'Balances & reports', collections: 'Collections', outstanding: 'Outstanding balances', balance: 'Student financial overview', summary: 'Finance summary',
  semantics: 'Current receivables and allocations, not a historical snapshot. Class refers to the class saved when the charge was generated. Due today is not overdue.',
  collectionNotice: 'Received dates are inclusive School-local calendar dates. Net collections exclude all currently reversed payments, even when reversed later. This is not a historical receivables snapshot.',
  from: 'Received from', to: 'Received through', net: 'Net charges', paid: 'Allocated payments', validPayments: 'Valid payments (all years)', collected: 'Net collections', gross: 'Gross received', reversed: 'Reversed amount', overdueStudents: 'Students with overdue balances',
  notOverdue: 'Not overdue', days1to30: '1–30 days', days31to60: '31–60 days', days61plus: '61+ days', asOf: 'Current state on', export: 'Download CSV', exportError: 'Export failed. Narrow the filters if the report exceeds 10,000 rows, then try again.', exportSuccess: 'CSV downloaded.',
  paidStatus: 'Paid', partialStatus: 'Partially paid', unpaidStatus: 'Unpaid', overdue: 'Overdue', history: 'Payment history', show: 'Show balance', current: 'Current charges',
} as const;
type Copy = { [K in keyof typeof reportsEn]: string };
export const reportsFr = {
  title: 'Soldes et rapports', collections: 'Encaissements', outstanding: 'Soldes impayés', balance: 'Situation financière de l’élève', summary: 'Synthèse financière',
  semantics: 'Créances et affectations actuelles, sans situation historique. La classe est celle enregistrée à la génération de la charge. Une échéance du jour n’est pas en retard.',
  collectionNotice: 'Dates de réception inclusives selon le calendrier local de l’établissement. Les encaissements nets excluent tout paiement actuellement contrepassé, même ultérieurement. Ce rapport ne représente pas les créances historiques.',
  from: 'Reçu à partir du', to: 'Reçu jusqu’au', net: 'Charges nettes', paid: 'Paiements affectés', validPayments: 'Paiements valides (toutes années)', collected: 'Encaissements nets', gross: 'Montant brut reçu', reversed: 'Montant contrepassé', overdueStudents: 'Élèves avec impayés en retard',
  notOverdue: 'Non échu', days1to30: '1 à 30 jours', days31to60: '31 à 60 jours', days61plus: '61 jours et plus', asOf: 'Situation actuelle au', export: 'Télécharger CSV', exportError: 'Échec de l’export. Limitez les filtres si le rapport dépasse 10 000 lignes, puis réessayez.', exportSuccess: 'CSV téléchargé.',
  paidStatus: 'Payé', partialStatus: 'Partiellement payé', unpaidStatus: 'Impayé', overdue: 'En retard', history: 'Historique des paiements', show: 'Voir le solde', current: 'Charges actuelles',
} satisfies Copy;
export const reportsAr = {
  title: 'الأرصدة والتقارير', collections: 'التحصيلات', outstanding: 'الأرصدة المستحقة', balance: 'الوضعية المالية للتلميذ', summary: 'الملخص المالي',
  semantics: 'المستحقات والتخصيصات الحالية وليست وضعية تاريخية. القسم هو المسجل عند إنشاء الرسم. المستحق اليوم لا يعد متأخراً.',
  collectionNotice: 'تواريخ الاستلام شاملة وفق التقويم المحلي للمؤسسة. يستثني صافي التحصيل جميع الدفعات المعكوسة حالياً ولو عُكست لاحقاً. هذا التقرير لا يمثل المستحقات التاريخية.',
  from: 'الاستلام من', to: 'الاستلام إلى', net: 'صافي الرسوم', paid: 'الدفعات المخصصة', validPayments: 'الدفعات الصالحة (كل السنوات)', collected: 'صافي التحصيل', gross: 'إجمالي المستلم', reversed: 'المبلغ المعكوس', overdueStudents: 'التلاميذ ذوو مستحقات متأخرة',
  notOverdue: 'غير متأخر', days1to30: 'من 1 إلى 30 يوماً', days31to60: 'من 31 إلى 60 يوماً', days61plus: '61 يوماً فأكثر', asOf: 'الوضعية الحالية في', export: 'تنزيل CSV', exportError: 'تعذر التصدير. ضيّق المرشحات إذا تجاوز التقرير 10000 سطر ثم أعد المحاولة.', exportSuccess: 'تم تنزيل CSV.',
  paidStatus: 'مدفوع', partialStatus: 'مدفوع جزئياً', unpaidStatus: 'غير مدفوع', overdue: 'متأخر', history: 'سجل الدفعات', show: 'عرض الرصيد', current: 'الرسوم الحالية',
} satisfies Copy;
