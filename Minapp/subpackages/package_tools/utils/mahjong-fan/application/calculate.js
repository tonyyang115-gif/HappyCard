const { validateRequest } = require('../domain/validator');
const { analyzeHand } = require('../domain/analyzer');
const { executeRules, applyDependencies } = require('../domain/rule-engine');
const { resolveConflicts } = require('../domain/conflict-resolver');
const { calculateFanAndScore } = require('../domain/fan-calculator');
const { buildSummary, buildExplainLines } = require('../domain/explainer');
const { ERROR_CODES } = require('../domain/constants');
const { getTemplateById, getDefaultTemplateId, annotateTemplateRuntime } = require('../template/repository');

function getResolvedTemplate(options = {}) {
  const templateId = options.templateId || getDefaultTemplateId();
  const template = getTemplateById(templateId);
  if (!template) {
    return {
      ok: false,
      errorCode: ERROR_CODES.TEMPLATE_NOT_FOUND,
      errorMessage: `模板不存在: ${templateId}`
    };
  }

  const merged = options.overrides
    ? annotateTemplateRuntime({ ...template, ...options.overrides })
    : template;

  if (!Array.isArray(merged.rules) || !Array.isArray(merged.conflictGroups)) {
    return {
      ok: false,
      errorCode: ERROR_CODES.TEMPLATE_INVALID_SCHEMA,
      errorMessage: '模板结构不完整'
    };
  }

  return {
    ok: true,
    template: merged
  };
}

function buildFailResult(errorCode, errorMessage, templateMeta = {}) {
  return {
    ok: false,
    totalFan: 0,
    totalScore: 0,
    appliedRules: [],
    removedByConflict: [],
    summary: `计算失败：${errorMessage}`,
    explain: [errorMessage],
    warnings: [],
    templateId: templateMeta.templateId || '',
    templateVersion: templateMeta.templateVersion || '',
    templateHash: templateMeta.templateHash || '',
    decisionTrace: [],
    errorCode,
    errorMessage
  };
}

function calculateMahjongFan(request, options = {}) {
  try {
    const templateResult = getResolvedTemplate(options);
    if (!templateResult.ok) {
      return buildFailResult(templateResult.errorCode, templateResult.errorMessage);
    }

    const template = templateResult.template;
    const validation = validateRequest(request);
    if (!validation.ok) {
      return buildFailResult(validation.errorCode, validation.errorMessage, {
        templateId: template.id,
        templateVersion: template.version,
        templateHash: template.templateHash
      });
    }

    const analysis = analyzeHand(request);
    if (!analysis.huValid) {
      return buildFailResult(ERROR_CODES.INVALID_WIN_CONTEXT, '输入牌型未构成可胡结构', {
        templateId: template.id,
        templateVersion: template.version,
        templateHash: template.templateHash
      });
    }

    const execution = executeRules(template, analysis);
    const dependencyResult = applyDependencies(execution.applied, execution.allRuleStates);

    const conflictResult = resolveConflicts(dependencyResult.kept, template.conflictGroups);
    const finalRules = conflictResult.kept;

    const calcMeta = calculateFanAndScore(finalRules, template);

    const decisionTrace = [];
    for (const removed of dependencyResult.removed) {
      decisionTrace.push({
        stage: removed.removedBy,
        winner: '',
        loser: removed.ruleId,
        reason: removed.reason
      });
    }
    decisionTrace.push(...conflictResult.decisionTrace);

    const result = {
      ok: true,
      totalFan: calcMeta.effectiveFan,
      totalScore: calcMeta.totalScore,
      appliedRules: finalRules,
      removedByConflict: dependencyResult.removed.concat(conflictResult.removed),
      summary: '',
      explain: [],
      warnings: [],
      templateId: template.id,
      templateVersion: template.version,
      templateHash: template.templateHash,
      decisionTrace
    };

    result.summary = buildSummary(result, template);
    result.explain = buildExplainLines(result, calcMeta, template);

    if (options.debug) {
      result.debug = {
        allRuleStates: execution.allRuleStates,
        analysis
      };
    }

    return result;
  } catch (error) {
    return buildFailResult(ERROR_CODES.INTERNAL_CALC_ERROR, error.message || '引擎异常');
  }
}

module.exports = {
  calculateMahjongFan
};
