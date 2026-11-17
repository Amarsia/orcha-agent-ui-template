function severity(score) {
  if (score >= 20) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export default async function buildRiskRegister({ risks }) {
  return {
    risks: risks
      .map((item) => {
        const score = item.likelihood * item.impact;
        return {
          risk: item.risk.trim(),
          score,
          severity: severity(score),
          mitigation: item.mitigation.trim(),
        };
      })
      .sort((left, right) => right.score - left.score),
  };
}
