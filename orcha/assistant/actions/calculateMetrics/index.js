export default async function calculateMetrics({ label, values }) {
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    label: label.trim(),
    count: values.length,
    sum,
    average: sum / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}
