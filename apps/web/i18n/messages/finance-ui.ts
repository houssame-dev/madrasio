export const financeUiEn = {
  "configuration": "Set up fee types, amounts and due dates. Existing charges keep their original terms.",
  "generation": "Select students and periods, review the preview, then confirm charges.",
  "charges": "Review individual charges, payments and reduction history.",
  "payments": "Record offline money received and allocate it to outstanding charges.",
  "reports": "Review student balances, collections and exports.",
  "allocationHint": "Allocate the full received amount. Each allocation must stay within its charge balance.",
  "paymentContext": "Select a student to review their outstanding charges before recording payment.",
  "receiptSnapshot": "This receipt records the original payment and allocations. Current balances are available in Reports.",
  "dateRange": "Choose a valid start and end date. The end date must not precede the start date.",
  "saving": "Saving…"
} as const;

export const financeUiFr = {
  "configuration": "Configurez les frais, les montants et les échéances. Les créances existantes conservent leurs conditions initiales.",
  "generation": "Sélectionnez les élèves et les périodes, vérifiez l’aperçu, puis confirmez les créances.",
  "charges": "Consultez chaque créance, ses paiements et son historique de réductions.",
  "payments": "Enregistrez les paiements hors ligne reçus et affectez-les aux créances restantes.",
  "reports": "Consultez les soldes des élèves, les encaissements et les exports.",
  "allocationHint": "Affectez la totalité du montant reçu sans dépasser le solde de chaque créance.",
  "paymentContext": "Sélectionnez un élève pour consulter ses créances avant d’enregistrer un paiement.",
  "receiptSnapshot": "Ce reçu conserve le paiement et ses affectations d’origine. Les soldes actuels figurent dans les rapports.",
  "dateRange": "Choisissez des dates valides. La date de fin ne doit pas précéder la date de début.",
  "saving": "Enregistrement…"
} satisfies Record<keyof typeof financeUiEn, string>;

export const financeUiAr = {
  "configuration": "اضبط أنواع الرسوم والمبالغ وتواريخ الاستحقاق. تحتفظ المستحقات الحالية بشروطها الأصلية.",
  "generation": "حدد التلاميذ والفترات، ثم راجع المعاينة وأكد إنشاء المستحقات.",
  "charges": "راجع كل مستحق ومدفوعاته وسجل التخفيضات.",
  "payments": "سجل المدفوعات المستلمة خارج المنصة ووزعها على المستحقات المتبقية.",
  "reports": "راجع أرصدة التلاميذ والتحصيلات وملفات التصدير.",
  "allocationHint": "وزع المبلغ المستلم بالكامل دون تجاوز الرصيد المتبقي لكل مستحق.",
  "paymentContext": "اختر تلميذاً لمراجعة مستحقاته قبل تسجيل الدفع.",
  "receiptSnapshot": "يحفظ هذا الإيصال الدفع وتوزيعاته الأصلية. تتوفر الأرصدة الحالية في التقارير.",
  "dateRange": "اختر تاريخي بداية ونهاية صالحين. يجب ألا تسبق النهاية البداية.",
  "saving": "جارٍ الحفظ…"
} satisfies Record<keyof typeof financeUiEn, string>;
