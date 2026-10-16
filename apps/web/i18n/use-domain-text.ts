'use client';

import { useMessages, useTranslations } from 'next-intl';
import { useMemo } from 'react';

// Only application-owned interface/validation strings are looked up here.
// Callers must never pass names, submission content or historical display labels.
const entries = [
  ["Required grading settings are missing.", "domainCalculation.UNCONFIGURED"],
  ["UNCONFIGURED", "domainCalculation.UNCONFIGURED"],
  ["Some grades are not valid for calculation.", "domainCalculation.GRADE_STATE"],
  ["GRADE_STATE", "domainCalculation.GRADE_STATE"],
  ["A required assessment is missing.", "domainCalculation.REQUIRED_ASSESSMENT"],
  ["REQUIRED_ASSESSMENT", "domainCalculation.REQUIRED_ASSESSMENT"],
  ["No usable grades or results are available.", "domainCalculation.NO_VALID_GRADES"],
  ["NO_VALID_GRADES", "domainCalculation.NO_VALID_GRADES"],
  ["The total weight is zero.", "domainCalculation.ZERO_WEIGHT"],
  ["ZERO_WEIGHT", "domainCalculation.ZERO_WEIGHT"],
  ["A required curriculum coefficient is missing.", "domainCalculation.MISSING_COEFFICIENT"],
  ["MISSING_COEFFICIENT", "domainCalculation.MISSING_COEFFICIENT"],
  ["This calculation mode is not supported.", "domainCalculation.UNSUPPORTED_MODE"],
  ["UNSUPPORTED_MODE", "domainCalculation.UNSUPPORTED_MODE"],
  ["No assessments are present in the gradebook.", "domainCalculation.noAssessments"],
  ["WEIGHTED aggregation has zero total weight.", "domainCalculation.zeroWeight"],
  ["thresholds.maxScore is required to calculate a subject result.", "domainCalculation.maximumRequired"],
  ["rounding is required to calculate a subject result.", "domainCalculation.roundingSubject"],
  ["assessmentWeighting is required to calculate a subject result.", "domainCalculation.weightingRequired"],
  ["coefficientUsage is USE_CURRICULUM_SUBJECT_COEFFICIENT but the CurriculumSubject coefficient is missing.", "domainCalculation.coefficientRequired"],
  ["periodCalculation is required to calculate a period result.", "domainCalculation.periodRequired"],
  ["rounding is required to calculate a period result.", "domainCalculation.roundingPeriod"],
  ["No subject results are available for the period.", "domainCalculation.noSubjects"],
  ["periodCalculation is WEIGHTED_AVERAGE but coefficientUsage is not USE_CURRICULUM_SUBJECT_COEFFICIENT.", "domainCalculation.coefficientMode"],
  ["WEIGHTED_AVERAGE has zero total coefficient.", "domainCalculation.zeroCoefficient"],
  ["annualCalculation is required to calculate an annual result.", "domainCalculation.annualRequired"],
  ["rounding is required to calculate an annual result.", "domainCalculation.roundingAnnual"],
  ["No period results are available for the academic year.", "domainCalculation.noPeriods"],
  ["There are no inputs to aggregate.", "domainCalculation.noInputs"],
  ["Search Classes by name", "domainUi.searchClasses"],
  ["Search Curricula by name", "domainUi.searchCurricula"],
  ["Clear search", "domainUi.clearSearch"],
  ["Searching…", "domainUi.searching"],
  ["Version names are the committed per-Curriculum identity; no numeric version counter is used.", "domainUi.versionIdentity"],
  ["Calculated and finalized describe the working result. Only publications are visible to Parents; revisions preserve previous snapshots.", "domainUi.resultVisibility"],
  ["Target administration is unavailable when exact Teacher management scope is incomplete.", "domainUi.targetScope"],
  [
    "Check the entered value.",
    "domainUi.invalid"
  ],
  [
    "This field is required.",
    "domainUi.required"
  ],
  [
    "Choose a valid option.",
    "domainUi.choose"
  ],
  [
    "Activate",
    "domainUi.activate"
  ],
  [
    "Deactivate",
    "domainUi.deactivate"
  ],
  [
    "Archive",
    "domainUi.archive"
  ],
  [
    "Open",
    "domainUi.open"
  ],
  [
    "Close",
    "domainUi.close"
  ],
  [
    "All Classes",
    "domainUi.allClasses"
  ],
  [
    "All Academic Years",
    "domainUi.allYears"
  ],
  [
    "Select an active curriculum version",
    "domainUi.activeCurriculum"
  ],
  [
    "No active curriculum version is available for a new binding.",
    "domainUi.noActiveCurriculum"
  ],
  [
    "Curriculum changes are locked for Classes with academic history or archived status. The historical reference is preserved.",
    "domainUi.classLocked"
  ],
  [
    "Choose a status for every changed Student.",
    "domainUi.chooseAttendance"
  ],
  [
    "Grading configuration",
    "domainUi.configurationTitle"
  ],
  [
    "Create configuration",
    "domainUi.createConfiguration"
  ],
  [
    "Configuration name",
    "domainUi.configurationName"
  ],
  [
    "Configuration versions",
    "domainUi.configurationVersions"
  ],
  [
    "Period calculation",
    "domainUi.periodCalculation"
  ],
  [
    "Annual calculation (V1 simple average)",
    "domainUi.annualCalculation"
  ],
  [
    "Assessment weighting",
    "domainUi.assessmentWeighting"
  ],
  [
    "Subject coefficient usage",
    "domainUi.coefficientUsage"
  ],
  [
    "Rounding mode",
    "domainUi.rounding"
  ],
  [
    "Decimal places",
    "domainUi.decimalPlaces"
  ],
  [
    "Result maximum score",
    "domainUi.resultMaximum"
  ],
  [
    "Passing score",
    "domainUi.passingScore"
  ],
  [
    "Not configured",
    "domainUi.notConfigured"
  ],
  [
    "Assessment type weights (0–100)",
    "domainUi.typeWeights"
  ],
  [
    "Required assessment types",
    "domainUi.requiredTypes"
  ],
  [
    "Select none to require no specific type. Use Ctrl/Command with click, or keyboard arrows and Shift, for multiple types.",
    "domainUi.requiredTypesHint"
  ],
  [
    "Unused draft: rules may be corrected before activation.",
    "domainUi.unusedDraft"
  ],
  [
    "Bound academic records exist. Their original rules remain preserved.",
    "domainUi.boundHistory"
  ],
  [
    "View exact stored rules",
    "domainUi.storedRules"
  ],
  [
    "Deactivate configuration",
    "domainUi.deactivateConfiguration"
  ],
  [
    "Reactivate configuration",
    "domainUi.reactivateConfiguration"
  ],
  [
    "Archive configuration (permanent)",
    "domainUi.archiveConfiguration"
  ],
  [
    "New draft version",
    "domainUi.newVersion"
  ],
  [
    "Save draft",
    "domainUi.saveDraft"
  ],
  [
    "Manage grading configuration",
    "domainUi.manageConfiguration"
  ],
  [
    "Publication history",
    "domainUi.publicationHistory"
  ],
  [
    "Not published. No publication history exists.",
    "domainUi.notPublished"
  ],
  [
    "Historical display labels were not recorded for this publication. No current names are substituted.",
    "domainUi.historicalLabels"
  ],
  [
    "Published (UTC):",
    "domainUi.publishedUtc"
  ],
  [
    "Revised publication",
    "domainUi.revisedPublication"
  ],
  [
    "Initial publication",
    "domainUi.initialPublication"
  ],
  [
    "Submission attachments",
    "domainUi.attachments"
  ],
  [
    "Loading attachments…",
    "domainUi.loadingAttachments"
  ],
  [
    "Attachments unavailable.",
    "domainUi.attachmentsUnavailable"
  ],
  [
    "No delivered attachments.",
    "domainUi.noAttachments"
  ],
  [
    "Add a private submission attachment",
    "domainUi.addAttachment"
  ],
  [
    "PDF, PNG or JPEG, up to 2 MiB; ten upload intents per logical Submission. Files are retained, not replaced on resubmission. No malware scanning.",
    "domainUi.attachmentHint"
  ],
  [
    "Choose a nonempty PDF, PNG or JPEG up to 2 MiB.",
    "domainUi.fileInvalid"
  ],
  [
    "Attachment added. Existing attachments are retained across resubmission.",
    "domainUi.attachmentAdded"
  ],
  [
    "Upload outcome needs operator reconciliation. Do not start another upload for this file.",
    "domainUi.uploadUncertain"
  ],
  [
    "Attachment could not be added. Refresh and check access, file type and submission state.",
    "domainUi.uploadFailed"
  ],
  [
    "School timezone unavailable",
    "domainUi.timezoneUnavailable"
  ],
  [
    "Time unavailable",
    "domainUi.timeUnavailable"
  ],
  [
    "Upload attachment",
    "domainUi.upload"
  ],
  [
    "Uploading…",
    "domainUi.uploading"
  ],
  [
    "Choose a valid, unambiguous School-local hand-in time.",
    "domainUi.validHandIn"
  ],
  [
    "Choose a valid calendar date.",
    "domainUi.calendarDate"
  ],
  [
    "Use a valid calendar date.",
    "domainUi.dateValid"
  ],
  [
    "End date must be after start date.",
    "domainUi.endAfterStart"
  ],
  [
    "Use a positive decimal with at most two decimal places.",
    "domainUi.positiveDecimal"
  ],
  [
    "Value must be greater than zero.",
    "domainUi.positive"
  ],
  [
    "Coefficient must be greater than zero.",
    "domainUi.positive"
  ],
  [
    "Title is required.",
    "domainUi.titleRequired"
  ],
  [
    "Title must be 200 characters or fewer.",
    "domainUi.titleLength"
  ],
  [
    "Name must be 200 characters or fewer.",
    "domainUi.nameLength"
  ],
  [
    "Choose at least one Class.",
    "domainUi.chooseClass"
  ],
  [
    "Each Class may be selected only once.",
    "domainUi.uniqueClass"
  ],
  [
    "Content must contain at most 50,000 characters.",
    "domainUi.contentLength"
  ],
  [
    "The request could not be completed. Please try again.",
    "domainUi.requestFailed"
  ],
  [
    "The Attendance request could not be completed. Please try again.",
    "domainUi.attendanceFailed"
  ],
  [
    "The Homework request could not be completed. Please try again.",
    "domainUi.homeworkFailed"
  ],
  [
    "These rules are locked to preserve academic history. Create a new draft version.",
    "domainUi.rulesLocked"
  ],
  [
    "A configuration with this name already exists.",
    "domainUi.configurationDuplicate"
  ],
  [
    "Check the grading settings. Activation needs complete calculation settings and compatible weighting.",
    "domainUi.configurationInvalid"
  ],
  [
    "This configuration is inactive or archived. Refresh its state before continuing.",
    "domainUi.configurationInactive"
  ],
  [
    "The action could not be completed. Refresh the configuration before trying again.",
    "domainUi.configurationFailed"
  ],
  [
    "This resource is no longer available.",
    "domainErrors.NOT_FOUND"
  ],
  [
    "That lifecycle change is not available from the current status.",
    "domainErrors.INVALID_STATUS_TRANSITION"
  ],
  [
    "A resource with the same identity already exists.",
    "domainErrors.DUPLICATE_RESOURCE"
  ],
  [
    "The selected academic context or dates are not valid.",
    "domainErrors.INVALID_ACADEMIC_CONTEXT"
  ],
  [
    "These academic year dates can no longer be changed because the year is operational or has dependent academic records.",
    "domainErrors.ACADEMIC_YEAR_DATES_IMMUTABLE"
  ],
  [
    "These period dates can no longer be changed because the period is operational or has dependent academic records.",
    "domainErrors.ACADEMIC_PERIOD_DATES_IMMUTABLE"
  ],
  [
    "Only a draft curriculum version can be structurally changed.",
    "domainErrors.CURRICULUM_VERSION_IMMUTABLE"
  ],
  [
    "The curriculum cannot be changed because the Class already has academic history.",
    "domainErrors.CLASS_CURRICULUM_IMMUTABLE"
  ],
  [
    "Select an active curriculum version.",
    "domainErrors.CURRICULUM_VERSION_NOT_ACTIVE"
  ],
  [
    "This Attendance context is unavailable or outside your current access.",
    "domainErrors.ATTENDANCE_NOT_FOUND"
  ],
  [
    "The selected date is not valid for this Class and Academic Year.",
    "domainErrors.INVALID_ATTENDANCE_DATE"
  ],
  [
    "Closed or archived Classes allow corrections to existing Attendance only.",
    "domainErrors.ATTENDANCE_ENTRY_NOT_ALLOWED"
  ],
  [
    "A selected Student was not enrolled in this Class on the Attendance date.",
    "domainErrors.STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE"
  ],
  [
    "This Gradebook is unavailable or outside your current access.",
    "domainErrors.GRADEBOOK_NOT_FOUND"
  ],
  [
    "This Assessment is no longer available.",
    "domainErrors.ASSESSMENT_NOT_FOUND"
  ],
  [
    "A Gradebook already exists for this exact Year, Period, Class, and Subject.",
    "domainErrors.DUPLICATE_GRADEBOOK"
  ],
  [
    "The selected Gradebook academic context is no longer eligible.",
    "domainErrors.INVALID_GRADEBOOK_CONTEXT"
  ],
  [
    "That Gradebook lifecycle change is not available from the current status.",
    "domainErrors.INVALID_GRADEBOOK_STATUS_TRANSITION"
  ],
  [
    "This Gradebook or its Academic Period no longer permits Assessment changes.",
    "domainErrors.GRADEBOOK_NOT_EDITABLE"
  ],
  [
    "This Assessment can no longer be changed because it is published, archived, or grades already depend on it.",
    "domainErrors.ASSESSMENT_NOT_EDITABLE"
  ],
  [
    "That Assessment lifecycle change is not available from the current status.",
    "domainErrors.INVALID_ASSESSMENT_STATUS_TRANSITION"
  ],
  [
    "Assessment date must fall inside the Gradebook Academic Period.",
    "domainErrors.INVALID_ASSESSMENT_DATE"
  ],
  [
    "Each valid score must be between zero and the Assessment maximum.",
    "domainErrors.INVALID_GRADE_SCORE"
  ],
  [
    "Grade entry requires an OPEN Gradebook and a PUBLISHED Assessment.",
    "domainErrors.GRADE_ENTRY_NOT_ALLOWED"
  ],
  [
    "A selected Student was not enrolled in this Class for the Assessment date.",
    "domainErrors.STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT"
  ],
  [
    "The server could not calculate this Result because required academic inputs are incomplete.",
    "domainErrors.CALCULATION_INCOMPLETE"
  ],
  [
    "The bound grading configuration cannot be used for this calculation.",
    "domainErrors.CONFIGURATION_INVALID"
  ],
  [
    "The Gradebook is not available for this Result calculation.",
    "domainErrors.GRADEBOOK_NOT_AVAILABLE"
  ],
  [
    "The Student is not enrolled in the selected academic context.",
    "domainErrors.STUDENT_NOT_ENROLLED"
  ],
  [
    "This Result is unavailable or outside your current access.",
    "domainErrors.RESULT_NOT_FOUND"
  ],
  [
    "This Result is already finalized and cannot be recalculated normally.",
    "domainErrors.RESULT_ALREADY_FINALIZED"
  ],
  [
    "Only a finalized Result can be published or revised.",
    "domainErrors.RESULT_NOT_FINALIZED"
  ],
  [
    "This Result already has an initial publication. Use the explicit revision action.",
    "domainErrors.RESULT_ALREADY_PUBLISHED"
  ],
  [
    "A revision requires an existing published Result.",
    "domainErrors.RESULT_NOT_PUBLISHED"
  ],
  [
    "The Result inputs do not form a valid calculation context.",
    "domainErrors.INVALID_RESULT_STATE"
  ],
  [
    "This publication attempt conflicts with an existing operation. Start a new intentional attempt.",
    "domainErrors.PUBLICATION_CONFLICT"
  ],
  [
    "This Homework is unavailable or outside your current access.",
    "domainErrors.HOMEWORK_NOT_FOUND"
  ],
  [
    "Published Homework content and Class targets are frozen.",
    "domainErrors.HOMEWORK_NOT_EDITABLE"
  ],
  [
    "That Homework lifecycle change is not available from the current status.",
    "domainErrors.INVALID_HOMEWORK_STATUS_TRANSITION"
  ],
  [
    "One of the selected Classes is already targeted.",
    "domainErrors.DUPLICATE_HOMEWORK_TARGET"
  ],
  [
    "The selected academic context is no longer valid for this Homework.",
    "domainErrors.INVALID_HOMEWORK_CONTEXT"
  ],
  [
    "Homework needs at least one currently ACTIVE Class target before publication.",
    "domainErrors.HOMEWORK_NOT_PUBLISHABLE"
  ],
  [
    "This Submission is unavailable or outside your current access.",
    "domainErrors.HOMEWORK_SUBMISSION_NOT_FOUND"
  ],
  [
    "This Student already has a Submission for the Homework.",
    "domainErrors.DUPLICATE_HOMEWORK_SUBMISSION"
  ],
  [
    "The Student was not enrolled in a targeted Class on the Homework due date.",
    "domainErrors.STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK"
  ],
  [
    "The current Homework lifecycle does not allow that Submission operation.",
    "domainErrors.HOMEWORK_SUBMISSION_NOT_ALLOWED"
  ],
  [
    "That Submission lifecycle action is not available from its current status.",
    "domainErrors.INVALID_HOMEWORK_SUBMISSION_STATE"
  ],
  [
    "Homework creation requires your current User to have an ACTIVE linked Teacher profile and matching ACTIVE assignment.",
    "domainErrors.teacherRequired"
  ],
  [
    "Check numeric ranges, passing score, required types and rule settings. Maximum and passing scores must be positive; passing score cannot exceed maximum. Weights must be 0–100 and rounding scale 0–6.",
    "domainUi.rulesHelp"
  ],
  [
    "The engine normalizes the total of the assessments present; weights do not need to sum to 100. Missing type weights prevent calculation.",
    "domainUi.weightsHelp"
  ],
  [
    "Coefficient values stay in the curriculum. Assessment maximum scores stay in Gradebook setup. Passing score is stored configuration metadata; it does not change the current average formula.",
    "domainUi.coefficientHelp"
  ],
  [
    "Activation archives the previous active version, without rebinding Gradebooks or recalculating results. Select one consistent version for all Gradebooks that will be aggregated together.",
    "domainUi.activationHelp"
  ],
  [
    "Rules are read-only to preserve academic history or because the configuration is inactive. For future changes, use a new draft under an active configuration.",
    "domainUi.rulesReadOnly"
  ],
  [
    "No grading configuration yet. Create a draft and activate it before setting up Gradebooks.",
    "domainUi.noConfiguration"
  ],
  [
    "ACTIVE",
    "domainEnums.ACTIVE"
  ],
  [
    "INACTIVE",
    "domainEnums.INACTIVE"
  ],
  [
    "ARCHIVED",
    "domainEnums.ARCHIVED"
  ],
  [
    "CLOSED",
    "domainEnums.CLOSED"
  ],
  [
    "PLANNED",
    "domainEnums.PLANNED"
  ],
  [
    "DRAFT",
    "domainEnums.DRAFT"
  ],
  [
    "OPEN",
    "domainEnums.OPEN"
  ],
  [
    "PUBLISHED",
    "domainEnums.PUBLISHED"
  ],
  [
    "FINALIZED",
    "domainEnums.FINALIZED"
  ],
  [
    "REVISED",
    "domainEnums.REVISED"
  ],
  [
    "CALCULATED",
    "domainEnums.CALCULATED"
  ],
  [
    "SUBMITTED",
    "domainEnums.SUBMITTED"
  ],
  [
    "LATE",
    "domainEnums.LATE"
  ],
  [
    "REVIEWED",
    "domainEnums.REVIEWED"
  ],
  [
    "RETURNED",
    "domainEnums.RETURNED"
  ],
  [
    "CLASS",
    "domainEnums.CLASS"
  ],
  [
    "SIMPLE_AVERAGE",
    "domainEnums.SIMPLE_AVERAGE"
  ],
  [
    "WEIGHTED_AVERAGE",
    "domainEnums.WEIGHTED_AVERAGE"
  ],
  [
    "EQUAL",
    "domainEnums.EQUAL"
  ],
  [
    "WEIGHTED",
    "domainEnums.WEIGHTED"
  ],
  [
    "IGNORE",
    "domainEnums.IGNORE"
  ],
  [
    "APPLY",
    "domainEnums.APPLY"
  ],
  [
    "NONE",
    "domainEnums.NONE"
  ],
  [
    "HALF_UP",
    "domainEnums.HALF_UP"
  ],
  [
    "HALF_EVEN",
    "domainEnums.HALF_EVEN"
  ],
  [
    "DOWN",
    "domainEnums.DOWN"
  ],
  [
    "UP",
    "domainEnums.UP"
  ],
  [
    "FLOOR",
    "domainEnums.FLOOR"
  ],
  [
    "CEIL",
    "domainEnums.CEIL"
  ],
  [
    "QUIZ",
    "domainEnums.QUIZ"
  ],
  [
    "TEST",
    "domainEnums.TEST"
  ],
  [
    "EXAM",
    "domainEnums.EXAM"
  ],
  [
    "ORAL",
    "domainEnums.ORAL"
  ],
  [
    "PROJECT",
    "domainEnums.PROJECT"
  ],
  [
    "HOMEWORK",
    "domainEnums.HOMEWORK"
  ],
  [
    "SUBJECT",
    "domainEnums.SUBJECT"
  ],
  [
    "PERIOD",
    "domainEnums.PERIOD"
  ],
  [
    "ANNUAL",
    "domainEnums.ANNUAL"
  ],
  [
    "Back to Gradebook setup",
    "domainUi.configurationBack"
  ],
  [
    "School-owned calculation rules. Drafts are editable; activated and archived versions preserve historical meaning.",
    "domainUi.configurationHelp"
  ],
  [
    "Grading configuration saved. Existing academic records were not recalculated.",
    "domainUi.configurationSaved"
  ],
  [
    "HALF_DOWN",
    "domainEnums.HALF_DOWN"
  ],
  [
    "TRUNCATE",
    "domainEnums.TRUNCATE"
  ],
  [
    "USE_CURRICULUM_SUBJECT_COEFFICIENT",
    "domainEnums.USE_CURRICULUM_SUBJECT_COEFFICIENT"
  ],
  [
    "Configure school years, levels, curricula, subjects, and classes.",
    "academic.description"
  ],
  [
    "Read-only access",
    "academic.readOnly"
  ],
  [
    "Your current role can inspect academic structure but cannot change it.",
    "academic.readOnlyDescription"
  ],
  [
    "Academic Years",
    "academic.sections.years"
  ],
  [
    "Stages & Levels",
    "academic.sections.structure"
  ],
  [
    "Tracks",
    "academic.sections.tracks"
  ],
  [
    "Subjects",
    "academic.sections.subjects"
  ],
  [
    "Curricula",
    "academic.sections.curricula"
  ],
  [
    "Classes",
    "academic.sections.classes"
  ],
  [
    "Add",
    "academic.add"
  ],
  [
    "Edit",
    "academic.edit"
  ],
  [
    "Save changes",
    "grades.save"
  ],
  [
    "Create",
    "grades.create"
  ],
  [
    "Actions",
    "homework.actions"
  ],
  [
    "Status",
    "homework.status"
  ],
  [
    "Name",
    "academic.name"
  ],
  [
    "Code",
    "academic.code"
  ],
  [
    "Optional",
    "grades.optional"
  ],
  [
    "Order",
    "academic.sequence"
  ],
  [
    "Stage",
    "academic.stage"
  ],
  [
    "Level",
    "academic.level"
  ],
  [
    "Track",
    "academic.track"
  ],
  [
    "No track",
    "academic.noTrack"
  ],
  [
    "Academic year",
    "academic.academicYear"
  ],
  [
    "Curriculum version",
    "academic.curriculumVersion"
  ],
  [
    "Start date",
    "academic.startDate"
  ],
  [
    "End date",
    "academic.endDate"
  ],
  [
    "Coefficient",
    "academic.coefficient"
  ],
  [
    "Subject",
    "domainEnums.SUBJECT"
  ],
  [
    "Display order",
    "academic.displayOrder"
  ],
  [
    "Page",
    "grades.page"
  ],
  [
    "Academic structure sections",
    "academic.academicSections"
  ],
  [
    "Loading academic structure…",
    "academic.loadingWorkspace"
  ],
  [
    "All academic years",
    "academic.allYears"
  ],
  [
    "All stages",
    "academic.allStages"
  ],
  [
    "Levels",
    "academic.levels"
  ],
  [
    "Loading records…",
    "academic.loading"
  ],
  [
    "Academic structure could not be loaded.",
    "academic.listError"
  ],
  [
    "Changes saved successfully.",
    "academic.mutationSuccess"
  ],
  [
    "Create academic year",
    "academic.createYear"
  ],
  [
    "Edit academic year",
    "academic.editYear"
  ],
  [
    "Manage periods",
    "academic.managePeriods"
  ],
  [
    "Create academic period",
    "academic.createPeriod"
  ],
  [
    "Edit academic period",
    "academic.editPeriod"
  ],
  [
    "Dates are read-only after this record leaves PLANNED status.",
    "academic.dateReadOnly"
  ],
  [
    "The server may also protect PLANNED dates once dependent academic records exist.",
    "academic.plannedDependency"
  ],
  [
    "Academic years are independent; the system does not invent a single global current year.",
    "academic.yearsDescription"
  ],
  [
    "Stages organize Levels; each Level keeps its authoritative Stage relationship.",
    "academic.structureDescription"
  ],
  [
    "Filter and manage Levels through their existing Stage relationship.",
    "academic.levelsDescription"
  ],
  [
    "Tracks are optional School-level pathways and do not belong to a Stage or Level.",
    "academic.tracksDescription"
  ],
  [
    "Curricula contain named historical versions; versions contain contextual subject coefficients.",
    "academic.curriculaDescription"
  ],
  [
    "Create stage",
    "academic.createStage"
  ],
  [
    "Edit stage",
    "academic.editStage"
  ],
  [
    "Create level",
    "academic.createLevel"
  ],
  [
    "Edit level",
    "academic.editLevel"
  ],
  [
    "Create track",
    "academic.createTrack"
  ],
  [
    "Edit track",
    "academic.editTrack"
  ],
  [
    "Create subject",
    "academic.createSubject"
  ],
  [
    "Edit subject",
    "academic.editSubject"
  ],
  [
    "Create curriculum",
    "academic.createCurriculum"
  ],
  [
    "Edit curriculum",
    "academic.editCurriculum"
  ],
  [
    "Curriculum versions",
    "academic.versions"
  ],
  [
    "Create curriculum version",
    "academic.createVersion"
  ],
  [
    "Edit curriculum version",
    "academic.editVersion"
  ],
  [
    "Version subjects",
    "academic.curriculumSubjects"
  ],
  [
    "Attach subject",
    "academic.attachSubject"
  ],
  [
    "Edit curriculum subject",
    "academic.editCurriculumSubject"
  ],
  [
    "Subject identity has no coefficient. Coefficients are configured inside curriculum versions.",
    "academic.noCoefficientOnSubject"
  ],
  [
    "Structural changes are available only while the curriculum version is DRAFT.",
    "academic.draftOnly"
  ],
  [
    "That subject is already attached to this curriculum version.",
    "academic.duplicateSubject"
  ],
  [
    "Create class",
    "academic.createClass"
  ],
  [
    "Edit class",
    "academic.editClass"
  ],
  [
    "Academic year is historical identity and cannot be changed after creation.",
    "academic.yearImmutable"
  ],
  [
    "Search subjects by name or code",
    "academic.searchSubjects"
  ],
  [
    "Search",
    "attendance.search"
  ],
  [
    "Clear",
    "attendance.clear"
  ],
  [
    "Filter by status",
    "academic.filterStatus"
  ],
  [
    "All statuses",
    "homework.allStatuses"
  ],
  [
    "Select a curriculum to manage its versions.",
    "academic.selectCurriculum"
  ],
  [
    "Select a curriculum version to inspect its subjects.",
    "academic.selectVersion"
  ],
  [
    "Loading options…",
    "academic.selectorLoading"
  ],
  [
    "Required options could not be loaded.",
    "academic.selectorUnavailable"
  ],
  [
    "Confirm lifecycle change",
    "academic.confirm"
  ],
  [
    "Record daily Class Attendance and review authorized Student history.",
    "attendance.description"
  ],
  [
    "Daily roster",
    "attendance.daily"
  ],
  [
    "Student history",
    "attendance.history"
  ],
  [
    "Choose an Academic Year, exact Class, and calendar date. The server roster determines historical eligibility.",
    "attendance.dailyDescription"
  ],
  [
    "Review persisted Attendance records using server-side scope, filters, and pagination.",
    "attendance.historyDescription"
  ],
  [
    "Academic Year",
    "homework.academicYear"
  ],
  [
    "Select Academic Year",
    "homework.selectYear"
  ],
  [
    "Class",
    "grades.class"
  ],
  [
    "Select Class",
    "attendance.selectClass"
  ],
  [
    "Attendance date",
    "attendance.date"
  ],
  [
    "Student",
    "homework.student"
  ],
  [
    "Note",
    "attendance.note"
  ],
  [
    "Not marked",
    "attendance.notMarked"
  ],
  [
    "Present",
    "attendance.statuses.PRESENT"
  ],
  [
    "Absent",
    "grades.gradeStates.ABSENT"
  ],
  [
    "Late",
    "attendance.statuses.LATE"
  ],
  [
    "Excused",
    "grades.gradeStates.EXCUSED"
  ],
  [
    "Mark unmarked present",
    "attendance.markAllPresent"
  ],
  [
    "This changes form state only and never overwrites an existing Attendance row.",
    "attendance.markAllPresentHint"
  ],
  [
    "Save Attendance",
    "attendance.save"
  ],
  [
    "Attendance saved atomically.",
    "attendance.saved"
  ],
  [
    "Unsaved Attendance changes",
    "attendance.unsaved"
  ],
  [
    "Discard unsaved Attendance changes?",
    "attendance.unsavedPrompt"
  ],
  [
    "Select an Academic Year, Class, and date to load the authoritative roster.",
    "attendance.selectContext"
  ],
  [
    "Choose today or an earlier School calendar date. The School timezone is authoritative.",
    "attendance.futureDate"
  ],
  [
    "The date must fall within the selected Academic Year.",
    "attendance.outsideYear"
  ],
  [
    "Attendance roster unavailable",
    "attendance.rosterUnavailable"
  ],
  [
    "Loading Attendance…",
    "attendance.loading"
  ],
  [
    "No historically eligible Students were returned for this Class and date.",
    "attendance.emptyRoster"
  ],
  [
    "Eligibility is already resolved from StudentEnrollment effective dates. Current placement is not used to filter these rows.",
    "attendance.historicalRoster"
  ],
  [
    "This Class is not ACTIVE. Existing rows can be corrected, but unmarked rows cannot be created.",
    "attendance.closedClass"
  ],
  [
    "Each roster page contains at most 100 unique Students, matching the atomic batch limit.",
    "attendance.rosterLimit"
  ],
  [
    "Search Students by name or code",
    "attendance.searchStudents"
  ],
  [
    "Select Student",
    "attendance.selectStudent"
  ],
  [
    "Date from",
    "attendance.dateFrom"
  ],
  [
    "Date to",
    "attendance.dateTo"
  ],
  [
    "Date from must be on or before date to.",
    "attendance.invalidDateRange"
  ],
  [
    "Student Attendance history unavailable",
    "attendance.historyUnavailable"
  ],
  [
    "No persisted Attendance records match these filters.",
    "attendance.noHistory"
  ],
  [
    "No global current Academic Year is assumed. A sole ACTIVE Year may be preselected only as a local convenience.",
    "attendance.noGlobalYear"
  ],
  [
    "Teacher options are narrowed from ACTIVE assignments; the server enforces exact Class and Academic Year scope.",
    "attendance.teacherScope"
  ],
  [
    "Attendance dates and today follow the current School timezone, not this device timezone.",
    "attendance.schoolTimezone"
  ],
  [
    "Gradebook setup",
    "grades.title"
  ],
  [
    "Manage exact grading contexts, Assessments, Grade entry, and server-calculated Results.",
    "grades.description"
  ],
  [
    "Only Gradebooks inside your active Class, Subject, and Academic Year assignments are returned by the server.",
    "grades.teacherDescription"
  ],
  [
    "Read only",
    "grades.readOnly"
  ],
  [
    "Create Gradebook",
    "grades.createGradebook"
  ],
  [
    "Choose every part of the exact Gradebook context. These selections cannot be changed after creation.",
    "grades.createDescription"
  ],
  [
    "No active grading configuration version is available.",
    "grades.noConfigurationVersions"
  ],
  [
    "A School administrator must activate a grading configuration and one of its versions before a Gradebook can be created.",
    "grades.noConfigurationVersionsDescription"
  ],
  [
    "Eligible grading configuration versions could not be loaded.",
    "grades.configurationVersionsUnavailable"
  ],
  [
    "Retry",
    "homework.retry"
  ],
  [
    "Gradebooks",
    "grades.gradebooks"
  ],
  [
    "No Gradebooks found",
    "grades.noGradebooks"
  ],
  [
    "No Gradebooks match the current School context and filters.",
    "grades.noGradebooksDescription"
  ],
  [
    "Loading Gradebooks…",
    "grades.loading"
  ],
  [
    "Gradebooks are unavailable",
    "grades.unavailable"
  ],
  [
    "The resource may not exist or may be outside your current access.",
    "grades.unavailableDescription"
  ],
  [
    "Academic Period",
    "homework.academicPeriod"
  ],
  [
    "Grading Configuration Version",
    "grades.configurationVersion"
  ],
  [
    "Gradebook name",
    "grades.name"
  ],
  [
    "Gradebook name (optional)",
    "grades.optionalName"
  ],
  [
    "Select an Academic Year",
    "grades.selectYear"
  ],
  [
    "Select an Academic Period",
    "grades.selectPeriod"
  ],
  [
    "Select a Class",
    "grades.selectClass"
  ],
  [
    "Select a Subject",
    "grades.selectSubject"
  ],
  [
    "Select an exact version",
    "grades.selectConfigurationVersion"
  ],
  [
    "All Academic Periods",
    "grades.allPeriods"
  ],
  [
    "All Subjects",
    "grades.allSubjects"
  ],
  [
    "Back to Gradebooks",
    "grades.backToGradebooks"
  ],
  [
    "Exact immutable context",
    "grades.exactContext"
  ],
  [
    "These identifiers were fixed when the Gradebook was created and cannot be changed.",
    "grades.exactContextDescription"
  ],
  [
    "Lifecycle",
    "grades.lifecycle"
  ],
  [
    "Opening makes this Gradebook operational for workflows permitted by the server.",
    "grades.lifecycleDescription.OPEN"
  ],
  [
    "Closing may stop further Grade and Assessment changes. Existing academic history remains available.",
    "grades.lifecycleDescription.CLOSED"
  ],
  [
    "Archiving is terminal and preserves this Gradebook and all related academic history.",
    "grades.lifecycleDescription.ARCHIVED"
  ],
  [
    "Assessments",
    "grades.assessments"
  ],
  [
    "Assessments remain separate from Gradebook lifecycle and from Homework records.",
    "grades.assessmentsDescription"
  ],
  [
    "Create Assessment",
    "grades.createAssessment"
  ],
  [
    "Edit Assessment",
    "grades.editAssessment"
  ],
  [
    "Title",
    "homework.titleField"
  ],
  [
    "Type",
    "grades.type"
  ],
  [
    "Maximum score",
    "grades.maximumScore"
  ],
  [
    "Assessment weight",
    "grades.weight"
  ],
  [
    "Assessment date",
    "grades.date"
  ],
  [
    "Weight is Assessment metadata used by grading configuration logic. It is not a Subject coefficient.",
    "grades.weightHint"
  ],
  [
    "Enter a positive decimal with up to two decimal places, such as 10, 10.5, or 12.25.",
    "grades.decimalHint"
  ],
  [
    "Published Assessment settings are read-only because calculation-relevant structure is locked.",
    "grades.publishedReadOnly"
  ],
  [
    "Archived Assessments are terminal and read-only.",
    "grades.archivedReadOnly"
  ],
  [
    "Closed and archived Gradebooks do not permit Assessment mutation.",
    "grades.gradebookReadOnly"
  ],
  [
    "This Academic Period is CLOSED, so new Assessments cannot be created.",
    "grades.periodClosed"
  ],
  [
    "Publish",
    "homework.publish"
  ],
  [
    "Publish Assessment?",
    "grades.publishTitle"
  ],
  [
    "Publishing locks calculation-relevant Assessment settings.",
    "grades.publishDescription"
  ],
  [
    "Archive Assessment?",
    "grades.archiveAssessmentTitle"
  ],
  [
    "Archiving is historical and terminal. Existing Grades are not deleted.",
    "grades.archiveAssessmentDescription"
  ],
  [
    "Unavailable",
    "grades.unknown"
  ],
  [
    "—",
    "grades.none"
  ],
  [
    "Gradebook filters",
    "grades.filters"
  ],
  [
    "Clear filters",
    "grades.clearFilters"
  ],
  [
    "All types",
    "grades.allTypes"
  ],
  [
    "Assessment status",
    "grades.assessmentStatusFilter"
  ],
  [
    "Assessment type",
    "grades.assessmentTypeFilter"
  ],
  [
    "Changes saved.",
    "grades.changesSaved"
  ],
  [
    "Assessment created.",
    "grades.assessmentCreated"
  ],
  [
    "Gradebook created.",
    "grades.gradebookCreated"
  ],
  [
    "Grade entry is deferred to Task 031.",
    "grades.futureGradeEntry"
  ],
  [
    "Results workspace",
    "grades.resultsWorkspace"
  ],
  [
    "Persisted Grades",
    "grades.rawGrades"
  ],
  [
    "Browse persisted Grade states across Students and Assessments. No averages are calculated in the browser.",
    "grades.rawGradesDescription"
  ],
  [
    "Not entered",
    "grades.selectState"
  ],
  [
    "Enter grades",
    "grades.enterGrades"
  ],
  [
    "Grade state",
    "grades.gradeState"
  ],
  [
    "Score",
    "grades.score"
  ],
  [
    "Student code",
    "grades.studentCode"
  ],
  [
    "Valid score",
    "grades.gradeStates.VALID"
  ],
  [
    "Missing",
    "grades.gradeStates.MISSING"
  ],
  [
    "A score is required when the Grade state is VALID.",
    "grades.scoreRequired"
  ],
  [
    "Use a non-negative decimal with at most two decimal places.",
    "grades.scoreInvalid"
  ],
  [
    "Change at least one Student Grade before saving.",
    "grades.noGradeChanges"
  ],
  [
    "Unsaved changes",
    "grades.unsavedChanges"
  ],
  [
    "Discard unsaved Grade changes?",
    "grades.unsavedPrompt"
  ],
  [
    "Grades saved. Results were not recalculated automatically.",
    "grades.gradeBatchSaved"
  ],
  [
    "Each page contains at most 100 Students, matching the atomic backend batch limit.",
    "grades.rosterLimit"
  ],
  [
    "Academic Results",
    "grades.resultsTitle"
  ],
  [
    "Browse and manage server-calculated Subject, Period, and Annual Results as separate resources.",
    "grades.resultsDescription"
  ],
  [
    "Subject Results",
    "grades.subjectResults"
  ],
  [
    "Period Results",
    "grades.periodResults"
  ],
  [
    "Annual Results",
    "grades.annualResults"
  ],
  [
    "Subject Result",
    "grades.subjectResult"
  ],
  [
    "Period Result",
    "grades.periodResult"
  ],
  [
    "Annual Result",
    "grades.annualResult"
  ],
  [
    "Calculated value",
    "grades.calculatedValue"
  ],
  [
    "Result type",
    "grades.resultType"
  ],
  [
    "No Results found",
    "grades.noResults"
  ],
  [
    "No Results match the selected type and filters.",
    "grades.noResultsDescription"
  ],
  [
    "Results are unavailable",
    "grades.resultsUnavailable"
  ],
  [
    "Calculate Result",
    "grades.calculateResult"
  ],
  [
    "Calculate Subject Result",
    "grades.calculateSubject"
  ],
  [
    "Calculate Period Result",
    "grades.calculatePeriod"
  ],
  [
    "Calculate Annual Result",
    "grades.calculateAnnual"
  ],
  [
    "The server uses authoritative Grades, configuration rules, and historical academic context. The browser performs no Result arithmetic.",
    "grades.calculateDescription"
  ],
  [
    "Select a Gradebook",
    "grades.selectGradebook"
  ],
  [
    "Select a Student",
    "grades.selectStudent"
  ],
  [
    "Select every required academic context field.",
    "grades.selectAllContext"
  ],
  [
    "Result calculated by the server.",
    "grades.calculationSucceeded"
  ],
  [
    "Calculation incomplete",
    "grades.incompleteCalculation"
  ],
  [
    "Period calculations resolve CurriculumSubject coefficients on the server. Coefficients are not editable here.",
    "grades.coefficientHint"
  ],
  [
    "Annual Results are calculated separately from Period Results; they are never derived from the latest Period in the browser.",
    "grades.annualHint"
  ],
  [
    "Result detail",
    "grades.resultDetail"
  ],
  [
    "Exact Result context",
    "grades.exactResultContext"
  ],
  [
    "Finalize",
    "grades.finalize"
  ],
  [
    "Finalize Result?",
    "grades.finalizeTitle"
  ],
  [
    "Finalization locks this Result for publication and historical use.",
    "grades.finalizeDescription"
  ],
  [
    "Publish Result",
    "grades.publishResult"
  ],
  [
    "Publish Result?",
    "grades.publishResultTitle"
  ],
  [
    "Publication creates an immutable Result snapshot. Eligible Parent recipients are resolved by the backend and cannot be edited here.",
    "grades.publishResultDescription"
  ],
  [
    "Publish revision",
    "grades.reviseResult"
  ],
  [
    "Recalculate and publish a revision?",
    "grades.reviseTitle"
  ],
  [
    "The server will atomically recalculate, finalize, and create a new immutable publication revision. Previous publications remain unchanged.",
    "grades.reviseDescription"
  ],
  [
    "Result published. Notifications are processed asynchronously.",
    "grades.resultPublished"
  ],
  [
    "Result revision published. Previous publications remain unchanged; notifications are processed asynchronously.",
    "grades.resultRevised"
  ],
  [
    "Result finalized.",
    "grades.resultFinalized"
  ],
  [
    "Publication version",
    "grades.publicationVersion"
  ],
  [
    "Published at",
    "grades.publishedAt"
  ],
  [
    "Subject Results are limited by your exact active Class, Subject, and Academic Year assignments. Period and Annual administration is unavailable to Teachers.",
    "grades.teacherResultsDescription"
  ],
  [
    "Period",
    "domainEnums.PERIOD"
  ],
  [
    "Annual",
    "domainEnums.ANNUAL"
  ],
  [
    "View Result",
    "grades.viewResult"
  ],
  [
    "Quiz",
    "domainEnums.QUIZ"
  ],
  [
    "Test",
    "domainEnums.TEST"
  ],
  [
    "Exam",
    "domainEnums.EXAM"
  ],
  [
    "Oral",
    "domainEnums.ORAL"
  ],
  [
    "Project",
    "domainEnums.PROJECT"
  ],
  [
    "Homework assessment",
    "domainEnums.HOMEWORK"
  ],
  [
    "Create, target, publish, and review Homework within authoritative academic scope.",
    "homework.description"
  ],
  [
    "Only Homework within your exact active Class, Subject, and Academic Year assignments is returned.",
    "homework.teacherDescription"
  ],
  [
    "Create Homework",
    "homework.create"
  ],
  [
    "Edit Homework",
    "homework.edit"
  ],
  [
    "Open Homework",
    "homework.details"
  ],
  [
    "Homework filters",
    "homework.filters"
  ],
  [
    "Search Homework",
    "homework.search"
  ],
  [
    "Due from",
    "homework.dueFrom"
  ],
  [
    "Due to",
    "homework.dueTo"
  ],
  [
    "Due from must be on or before due to.",
    "homework.invalidRange"
  ],
  [
    "Due date",
    "homework.dueDate"
  ],
  [
    "Description",
    "homework.descriptionField"
  ],
  [
    "Plain text only. Private files may be attached to an existing Submission.",
    "homework.plainText"
  ],
  [
    "Due date must fall inside the Academic Year.",
    "homework.dueInsideYear"
  ],
  [
    "Due date must fall inside the Academic Period.",
    "homework.dueInsidePeriod"
  ],
  [
    "Select Academic Period",
    "homework.selectPeriod"
  ],
  [
    "Select Subject",
    "homework.selectSubject"
  ],
  [
    "Homework created as DRAFT.",
    "homework.createSuccess"
  ],
  [
    "Homework unavailable",
    "homework.unavailable"
  ],
  [
    "Loading Homework…",
    "homework.loading"
  ],
  [
    "No Homework matches these filters.",
    "homework.noHomework"
  ],
  [
    "Creation requires this signed-in User to have an ACTIVE linked Teacher profile and an ACTIVE matching Subject and Academic Year assignment. No Teacher can be selected on the client.",
    "homework.authorScopeMissing"
  ],
  [
    "Overview",
    "homework.overview"
  ],
  [
    "Teacher author",
    "homework.author"
  ],
  [
    "Class targets",
    "homework.targets"
  ],
  [
    "Add Class targets",
    "homework.addTargets"
  ],
  [
    "Class targets added.",
    "homework.targetsAdded"
  ],
  [
    "Targets are CLASS-only, may include multiple Classes, and cannot be removed through the committed API.",
    "homework.targetHint"
  ],
  [
    "Targets are frozen after publication. The committed API has no target deletion operation.",
    "homework.targetFrozen"
  ],
  [
    "No Classes are targeted yet.",
    "homework.noTargets"
  ],
  [
    "Publishing makes the Homework operational, freezes its structure and targets, and requires at least one ACTIVE Class target.",
    "homework.publishDescription"
  ],
  [
    "Closing stops new submissions while preserving Homework and Submission history.",
    "homework.closeDescription"
  ],
  [
    "Archiving is terminal and preserves all Homework history.",
    "homework.archiveDescription"
  ],
  [
    "Student and Submission roster",
    "homework.roster"
  ],
  [
    "The server resolves historical eligibility from StudentEnrollment on the Homework due date.",
    "homework.rosterHint"
  ],
  [
    "Not delivered",
    "homework.notSubmitted"
  ],
  [
    "Delivered",
    "homework.delivered"
  ],
  [
    "Latest recorded at",
    "homework.submittedAt"
  ],
  [
    "Actual hand-in time (optional)",
    "homework.actualHandedInAt"
  ],
  [
    "Actual hand-in",
    "homework.actualTime"
  ],
  [
    "Unknown — lateness uses recording time",
    "homework.unknownActual"
  ],
  [
    "First recorded at",
    "homework.firstRecorded"
  ],
  [
    "Submission",
    "homework.submission"
  ],
  [
    "Submission content",
    "homework.content"
  ],
  [
    "Record Submission",
    "homework.createSubmission"
  ],
  [
    "Open Submission",
    "homework.viewSubmission"
  ],
  [
    "Submission saved.",
    "homework.submissionSaved"
  ],
  [
    "Mark reviewed",
    "homework.review"
  ],
  [
    "Mark this Submission as reviewed. No Grade or Result is created.",
    "homework.reviewDescription"
  ],
  [
    "Return for revision",
    "homework.return"
  ],
  [
    "Resubmit returned work",
    "homework.resubmit"
  ],
  [
    "Reviewed",
    "homework.reviewed"
  ],
  [
    "Delivered, but returned for revision. Follow-up is required; record the next hand-in on the same Submission.",
    "homework.returnedHint"
  ],
  [
    "Lateness uses the actual hand-in when known, otherwise recording time, against the end of the School-local due date.",
    "homework.lateOwned"
  ],
  [
    "Broad Homework management is unavailable to Parents. Related-child Homework discovery belongs in the future child portal.",
    "homework.parentBoundary"
  ],
  [
    "Related-child Homework",
    "homework.parentReadOnly"
  ],
  [
    "This direct resource view is read-only and the server verifies current Parent relationship plus due-date historical eligibility.",
    "homework.parentReadOnlyHint"
  ],
  [
    "Not delivered — no related-child Submission has been recorded for this Homework.",
    "homework.noChildSubmissions"
  ],
  [
    "Related child",
    "homework.relatedChild"
  ],
  [
    "Back to Children",
    "homework.backToChildren"
  ],
  [
    "Back to Homework",
    "homework.back"
  ],
  [
    "SIMPLE AVERAGE",
    "domainEnums.SIMPLE_AVERAGE"
  ],
  [
    "WEIGHTED AVERAGE",
    "domainEnums.WEIGHTED_AVERAGE"
  ],
  [
    "HALF UP",
    "domainEnums.HALF_UP"
  ],
  [
    "HALF EVEN",
    "domainEnums.HALF_EVEN"
  ],
  [
    "HALF DOWN",
    "domainEnums.HALF_DOWN"
  ],
  [
    "USE CURRICULUM SUBJECT COEFFICIENT",
    "domainEnums.USE_CURRICULUM_SUBJECT_COEFFICIENT"
  ],
  [
    "Cancel",
    "foundation.actions.cancel"
  ],
  [
    "Save",
    "foundation.actions.save"
  ],
  [
    "Try again",
    "foundation.actions.retry"
  ],
  [
    "Previous",
    "collection.previous"
  ],
  [
    "Next",
    "collection.next"
  ],
  [
    "Pagination",
    "collection.pagination"
  ],
  [
    "No records yet",
    "collection.empty"
  ],
  [
    "Create the first record when your school is ready.",
    "collection.emptyDescription"
  ],
  [
    "Confirm",
    "collection.confirm"
  ],
  [
    "Academic Structure",
    "navigation.items.academic"
  ],
  [
    "Attendance",
    "navigation.items.attendance"
  ],
  [
    "Homework",
    "navigation.items.homework"
  ],
  [
    "Required",
    "domainUi.required"
  ],
  [
    "Invalid uuid",
    "domainUi.choose"
  ],
  [
    "Invalid date",
    "domainUi.calendarDate"
  ],
  [
    "Select an Academic Year.",
    "grades.selectYear"
  ],
  [
    "Select an Academic Period.",
    "grades.selectPeriod"
  ],
  [
    "Select a Class.",
    "grades.selectClass"
  ],
  [
    "Select a Subject.",
    "grades.selectSubject"
  ],
  [
    "Select an exact Grading Configuration Version.",
    "grades.selectConfigurationVersion"
  ]
] as const;
type MessageKey = (typeof entries)[number][1];
const textKeys: ReadonlyMap<string, MessageKey> = new Map<string, MessageKey>(entries);

function literals(value: object): string[] {
  return Object.values(value).flatMap((child) => typeof child === 'string' ? [child] : child && typeof child === 'object' ? literals(child) : []);
}

export function useDomainText() {
  const t = useTranslations();
  const catalog = useMessages();
  const messages = useMemo(() => new Set(literals(catalog)), [catalog]);
  function text(value: string): string;
  function text(value: undefined): undefined;
  function text(value: string | undefined): string | undefined;
  function text(value: string | undefined): string | undefined {
    if (value === undefined || value === '') return value;
    const key = textKeys.get(value);
    if (key) return t(key);
    if (messages.has(value)) return value;
    const maximum = /^String must contain at most (\d+) character/.exec(value);
    if (maximum) return t('domainUi.maxLength', { maximum: Number(maximum[1]) });
    const minimum = /^String must contain at least (\d+) character/.exec(value);
    if (minimum) return t('domainUi.minLength', { minimum: Number(minimum[1]) });
    const assessmentState = /^Assessment "([^"]+)" has grade state (MISSING|ABSENT|EXCUSED); all grades must be VALID to calculate a subject result\.$/.exec(value);
    if (assessmentState) return t('domainCalculation.assessmentState', {
      assessment: assessmentState[1],
      state: t(assessmentState[2] === 'MISSING' ? 'grades.gradeStates.MISSING' : assessmentState[2] === 'ABSENT' ? 'grades.gradeStates.ABSENT' : 'grades.gradeStates.EXCUSED'),
    });
    const missingType = /^Required assessment type "([^"]+)" has no assessment in the gradebook\.$/.exec(value);
    if (missingType) return t('domainCalculation.missingType', { type: text(missingType[1]) });
    const missingWeights = /^WEIGHTED aggregation has no configured weight for assessment type\(s\): (.+)\.$/.exec(value);
    if (missingWeights) return t('domainCalculation.missingWeights', { types: missingWeights[1].split(', ').map((type) => text(type)).join(', ') });
    const missingSubjects = /^CurriculumSubject coefficient missing for subject\(s\): (.+)\.$/.exec(value);
    if (missingSubjects) return t('domainCalculation.missingSubjects', { subjects: missingSubjects[1] });
    const periodMode = /^periodCalculation mode "([^"]+)" is not supported\.$/.exec(value);
    if (periodMode) return t('domainCalculation.periodMode', { mode: periodMode[1] });
    const annualMode = /^annualCalculation mode "([^"]+)" is not supported in V1; only SIMPLE_AVERAGE is defined\.$/.exec(value);
    if (annualMode) return t('domainCalculation.annualMode', { mode: annualMode[1] });
    return t('domainUi.invalid');
  }
  return text;
}
