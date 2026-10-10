function asResult(hit, reason, count = 1) {
  return {
    hit: Boolean(hit),
    count: hit ? count : 0,
    reason: reason || ''
  };
}

const detectors = {
  hu_valid(analysis) {
    return asResult(analysis.huValid, analysis.huValid ? '牌型满足和牌结构' : '牌型未满足和牌结构');
  },
  pinghu(analysis) {
    const hit = analysis.huValid
      && !analysis.qidui
      && !analysis.longQidui
      && !analysis.duiduihu
      && !analysis.jingoudiao
      && !analysis.shisanyao;
    return asResult(hit, hit ? '基础平胡成立' : '不满足平胡条件');
  },
  duiduihu(analysis) {
    return asResult(analysis.duiduihu, analysis.duiduihu ? '对对胡成立' : '对对胡不成立');
  },
  qidui(analysis) {
    return asResult(analysis.qidui, analysis.qidui ? '七对成立' : '七对不成立');
  },
  longqidui(analysis) {
    return asResult(analysis.longQidui, analysis.longQidui ? '龙七对成立' : '龙七对不成立');
  },
  qingyise(analysis) {
    return asResult(analysis.qingyise, analysis.qingyise ? '清一色成立' : '清一色不成立');
  },
  jingoudiao(analysis) {
    return asResult(analysis.jingoudiao, analysis.jingoudiao ? '金钩钓成立' : '金钩钓不成立');
  },
  zimo(analysis) {
    const hit = analysis.winMode === 'zimo';
    return asResult(hit, hit ? '自摸成立' : '非自摸');
  },
  menqing(analysis) {
    const hit = analysis.context.menqing === true && analysis.meldCount === 0;
    return asResult(hit, hit ? '门清成立' : '门清不成立');
  },
  gang_shang_hua(analysis) {
    const hit = analysis.context.gangShangHua === true;
    return asResult(hit, hit ? '杠上花成立' : '杠上花不成立');
  },
  gang_shang_pao(analysis) {
    const hit = analysis.context.gangShangPao === true;
    return asResult(hit, hit ? '杠上炮成立' : '杠上炮不成立');
  },
  qiang_gang_hu(analysis) {
    const hit = analysis.context.qiangGangHu === true;
    return asResult(hit, hit ? '抢杠胡成立' : '抢杠胡不成立');
  },
  hai_di(analysis) {
    const hit = analysis.context.haiDi === true;
    return asResult(hit, hit ? '海底成立' : '海底不成立');
  },
  tian_hu(analysis) {
    const hit = analysis.context.tianHu === true;
    return asResult(hit, hit ? '天胡成立' : '天胡不成立');
  },
  di_hu(analysis) {
    const hit = analysis.context.diHu === true;
    return asResult(hit, hit ? '地胡成立' : '地胡不成立');
  },
  gen_count(analysis) {
    const hit = analysis.genCount > 0;
    return asResult(hit, hit ? `带根 ${analysis.genCount} 个` : '无带根', analysis.genCount);
  }
};

function runDetector(detectorKey, analysis) {
  const detector = detectors[detectorKey];
  if (!detector) {
    return asResult(false, `未注册 detector: ${detectorKey}`);
  }
  try {
    return detector(analysis);
  } catch (error) {
    return asResult(false, `detector异常: ${error.message || 'unknown'}`);
  }
}

module.exports = {
  runDetector
};
