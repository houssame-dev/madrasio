'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { useAppContext } from '@/components/app/app-context';
import { PageContainer } from '@/components/ui/page-container';
import { AccessDeniedState, ApiErrorState, PageLoading } from '@/components/ui/states';
import {
  Field,
  FormActions,
  InlineFeedback,
  Pagination,
  StatusBadge,
  inputClassName,
} from '@/components/academic/ui';
import { can } from '@/lib/frontend/permissions';
import {
  configurationApi,
  configurationFailure,
  configurationKey,
  type ConfigurationDetail,
  type ConfigurationVersion,
} from '@/lib/frontend/grades/configuration';
import { gradeKeys } from '@/lib/frontend/grades/queries';
import {
  ASSESSMENT_TYPES,
  configurationRules,
  type ConfigurationRules,
} from '@/lib/modules/grades/domain/configuration-contracts';
import {
  CALCULATION_MODES,
  COEFFICIENT_USAGE_MODES,
  ROUNDING_MODES,
  WEIGHTING_MODES,
} from '@/lib/modules/grades/domain/grading-rules';

const formSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rules: configurationRules,
});
type FormValue = z.infer<typeof formSchema>;
const defaults: ConfigurationRules = {
  schemaVersion: 1,
  periodCalculation: { mode: 'SIMPLE_AVERAGE' },
  annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: { mode: 'EQUAL' },
  coefficientUsage: { mode: 'IGNORE' },
  rounding: { mode: 'HALF_UP', scale: 2 },
  thresholds: { maxScore: 20, passingScore: 10 },
};
export function GradingRulesForm({
  initial,
  creating,
  save,
  onCancel,
}: {
  initial?: unknown;
  creating?: boolean;
  save: (value: FormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const parsed = configurationRules.safeParse(initial);
  const rules = parsed.success ? parsed.data : defaults;
  const form = useForm<FormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: creating ? '' : 'Version', rules },
  });
  const mutation = useMutation({ mutationFn: save, retry: false });
  const weighting = form.watch('rules.assessmentWeighting.mode');
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (value) => {
          if (!mutation.isPending) mutation.mutate(value);
        },
        (errors) => {
          const weights = errors.rules?.assessmentWeighting?.weightsByType;
          const first = ASSESSMENT_TYPES.find((type) => weights?.[type]);
          if (first && !errors.name && !errors.rules?.thresholds && !errors.rules?.rounding)
            document.getElementById(`weight-${first}`)?.focus();
        },
      )}
    >
      {mutation.isError ? (
        <InlineFeedback kind="error">{configurationFailure(mutation.error)}</InlineFeedback>
      ) : null}
      {form.formState.errors.rules ? (
        <div id="grading-rules-errors" tabIndex={-1}>
          <InlineFeedback kind="error">
            Check numeric ranges, passing score, required types and rule settings. Maximum and
            passing scores must be positive; passing score cannot exceed maximum. Weights must be
            0–100 and rounding scale 0–6.
          </InlineFeedback>
        </div>
      ) : null}
      {creating ? (
        <Field
          label="Configuration name"
          htmlFor="configuration-name"
          required
          error={form.formState.errors.name?.message}
        >
          <input id="configuration-name" className={inputClassName} {...form.register('name')} />
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ['rules.periodCalculation.mode', 'Period calculation', CALCULATION_MODES],
            [
              'rules.annualCalculation.mode',
              'Annual calculation (V1 simple average)',
              ['SIMPLE_AVERAGE'],
            ],
            ['rules.assessmentWeighting.mode', 'Assessment weighting', WEIGHTING_MODES],
            ['rules.coefficientUsage.mode', 'Subject coefficient usage', COEFFICIENT_USAGE_MODES],
            ['rules.rounding.mode', 'Rounding mode', ROUNDING_MODES],
          ] as const
        ).map(([path, label, options]) => (
          <Field
            key={path}
            label={label}
            htmlFor={path}
            required
            error={form.getFieldState(path, form.formState).error?.message}
          >
            <select id={path} className={inputClassName} {...form.register(path)}>
              <option value="">Not configured</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
        ))}
        {(
          [
            ['rules.rounding.scale', 'Decimal places'],
            ['rules.thresholds.maxScore', 'Result maximum score'],
            ['rules.thresholds.passingScore', 'Passing score'],
          ] as const
        ).map(([path, label]) => (
          <Field
            key={path}
            label={label}
            htmlFor={path}
            required
            error={form.getFieldState(path, form.formState).error?.message}
          >
            <input
              id={path}
              type="number"
              step="any"
              className={inputClassName}
              aria-describedby={form.formState.errors.rules ? 'grading-rules-errors' : undefined}
              {...form.register(path, { valueAsNumber: true })}
            />
          </Field>
        ))}
      </div>
      {weighting === 'WEIGHTED' ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend>Assessment type weights (0–100)</legend>
          <p className="text-sm sm:col-span-2">
            The engine normalizes the total of the assessments present; weights do not need to sum
            to 100. Missing type weights prevent calculation.
          </p>
          {ASSESSMENT_TYPES.map((type) => (
            <Field
              key={type}
              label={`${type} weight`}
              htmlFor={`weight-${type}`}
              error={
                form.formState.errors.rules?.assessmentWeighting?.weightsByType?.[type]?.message
              }
            >
              <input
                id={`weight-${type}`}
                type="number"
                step="any"
                className={inputClassName}
                value={form.watch(`rules.assessmentWeighting.weightsByType.${type}`) ?? ''}
                onChange={(event) => {
                  const path = `rules.assessmentWeighting.weightsByType.${type}` as const;
                  if (event.target.value === '') form.unregister(path);
                  else form.setValue(path, Number(event.target.value));
                }}
              />
            </Field>
          ))}
        </fieldset>
      ) : null}
      <Field
        label="Required assessment types"
        htmlFor="required-types"
        hint="Select none to require no specific type. Use Ctrl/Command with click, or keyboard arrows and Shift, for multiple types."
      >
        <select
          multiple
          id="required-types"
          className={`${inputClassName} h-36`}
          value={form.watch('rules.requiredAssessments.types') ?? []}
          onChange={(event) => {
            const types = Array.from(
              event.target.selectedOptions,
              (option) => option.value,
            ) as (typeof ASSESSMENT_TYPES)[number][];
            form.setValue('rules.requiredAssessments', types.length ? { types } : undefined);
          }}
        >
          {ASSESSMENT_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </Field>
      <p className="text-sm text-muted-foreground">
        Coefficient values stay in the curriculum. Assessment maximum scores stay in Gradebook
        setup. Passing score is stored configuration metadata; it does not change the current
        average formula.
      </p>
      <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel="Save draft" />
    </form>
  );
}

function ConfigurationEditor({
  detail,
  saved,
}: {
  detail: ConfigurationDetail;
  saved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ConfigurationVersion | 'new' | null>(null);
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    retry: false,
    onSuccess: saved,
  });
  const perform = (operation: () => Promise<unknown>) => {
    if (!mutation.isPending) mutation.mutate(operation);
  };
  return (
    <section className="space-y-4" aria-label="Configuration versions">
      <h2 className="text-xl font-semibold">
        {detail.name} <StatusBadge status={detail.status} />
      </h2>
      {mutation.isError ? (
        <InlineFeedback kind="error">{configurationFailure(mutation.error)}</InlineFeedback>
      ) : null}
      <p className="text-sm">
        Activation archives the previous active version, without rebinding Gradebooks or
        recalculating results. Select one consistent version for all Gradebooks that will be
        aggregated together.
      </p>
      {detail.status !== 'ARCHIVED' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              perform(() =>
                configurationApi.status(
                  detail.id,
                  detail.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                ),
              )
            }
          >
            {detail.status === 'ACTIVE' ? 'Deactivate configuration' : 'Reactivate configuration'}
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => perform(() => configurationApi.status(detail.id, 'ARCHIVED'))}
          >
            Archive configuration (permanent)
          </Button>
          {detail.status === 'ACTIVE' ? (
            <Button disabled={mutation.isPending} onClick={() => setEditing('new')}>
              New draft version
            </Button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <PageContainer variant="FORM_DETAIL">
          <h3 className="font-semibold">
            {editing === 'new' ? 'New draft version' : `Edit draft v${editing.versionNumber}`}
          </h3>
          <GradingRulesForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={
              editing === 'new'
                ? detail.versions.find((v) => v.status === 'ACTIVE')?.rules
                : editing.rules
            }
            onCancel={() => setEditing(null)}
            save={async (value) => {
              if (editing === 'new') await configurationApi.version(detail.id, value.rules);
              else await configurationApi.rules(detail.id, editing.id, value.rules);
              await saved();
              setEditing(null);
            }}
          />
        </PageContainer>
      ) : null}
      {detail.versions.map((version) => (
        <article key={version.id} className="space-y-3 rounded border p-4">
          <h3 className="font-semibold">
            Version {version.versionNumber} <StatusBadge status={version.status} />
          </h3>
          {!version.editable ? (
            <p>
              Rules are read-only to preserve academic history or because the configuration is
              inactive. For future changes, use a new draft under an active configuration.
            </p>
          ) : (
            <p>Unused draft: rules may be corrected before activation.</p>
          )}
          {version.hasHistory ? (
            <p>Bound academic records exist. Their original rules remain preserved.</p>
          ) : null}
          <details>
            <summary className="cursor-pointer">View exact stored rules</summary>
            <pre className="overflow-auto whitespace-pre-wrap break-words text-sm">
              {JSON.stringify(version.rules, null, 2)}
            </pre>
          </details>
          {detail.status === 'ACTIVE' ? (
            <div className="flex flex-wrap gap-2">
              {version.editable ? (
                <Button disabled={mutation.isPending} onClick={() => setEditing(version)}>
                  Edit draft v{version.versionNumber}
                </Button>
              ) : null}
              {version.status === 'DRAFT' ? (
                <Button
                  disabled={mutation.isPending}
                  onClick={() =>
                    perform(() => configurationApi.transition(detail.id, version.id, 'ACTIVE'))
                  }
                >
                  Activate v{version.versionNumber}
                </Button>
              ) : null}
              {version.status !== 'ARCHIVED' ? (
                <Button
                  disabled={mutation.isPending}
                  onClick={() =>
                    perform(() => configurationApi.transition(detail.id, version.id, 'ARCHIVED'))
                  }
                >
                  Archive v{version.versionNumber}
                </Button>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
function SchoolConfigurationWorkspace({ schoolId }: { schoolId: string }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  const client = useQueryClient();
  const key = configurationKey(schoolId);
  const list = useQuery({
    queryKey: [...key, 'list', page],
    queryFn: () => configurationApi.list(page),
  });
  const detail = useQuery({
    queryKey: [...key, 'detail', selected],
    queryFn: () => configurationApi.detail(selected!),
    enabled: !!selected,
  });
  const saved = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: gradeKeys.configurationVersions(schoolId) }),
    ]);
    setSuccess(true);
  };
  if (list.isPending) return <PageLoading />;
  if (list.isError) return <ApiErrorState onRetry={() => void list.refetch()} />;
  return (
    <PageContainer variant="MANAGEMENT_WIDE" className="space-y-6">
      <Link href="/grades" className="underline">
        Back to Gradebook setup
      </Link>
      <h1 className="text-2xl font-semibold">Grading configuration</h1>
      <p>
        School-owned calculation rules. Drafts are editable; activated and archived versions
        preserve historical meaning.
      </p>
      {success ? (
        <InlineFeedback kind="success">
          Grading configuration saved. Existing academic records were not recalculated.
        </InlineFeedback>
      ) : null}
      {creating ? (
        <PageContainer variant="FORM_DETAIL">
          <GradingRulesForm
            creating
            onCancel={() => setCreating(false)}
            save={async (value) => {
              await configurationApi.create(value);
              await saved();
              setCreating(false);
            }}
          />
        </PageContainer>
      ) : (
        <Button onClick={() => setCreating(true)}>Create configuration</Button>
      )}
      <ul className="flex flex-wrap gap-3">
        {list.data.data.map((row) => (
          <li key={row.id}>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(row.id);
                setSuccess(false);
              }}
            >
              {row.name} — {row.status}
            </Button>
          </li>
        ))}
      </ul>
      {!list.data.data.length ? (
        <p>
          No grading configuration yet. Create a draft and activate it before setting up Gradebooks.
        </p>
      ) : null}
      <Pagination page={page} pageSize={50} total={list.data.meta.total} onPage={setPage} />
      {selected ? (
        detail.isPending ? (
          <PageLoading />
        ) : detail.isError ? (
          <ApiErrorState onRetry={() => void detail.refetch()} />
        ) : (
          <ConfigurationEditor key={selected} detail={detail.data} saved={saved} />
        )
      ) : null}
    </PageContainer>
  );
}
export function GradingConfigurationWorkspace() {
  const app = useAppContext();
  const current = app.currentSchool;
  if (!current || !can(current.role, 'grades.manage')) return <AccessDeniedState />;
  return <SchoolConfigurationWorkspace key={current.id} schoolId={current.id} />;
}
