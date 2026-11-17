export default async function prioritizeTasks({ tasks }) {
  const ranked = tasks
    .map((task) => ({
      title: task.title.trim(),
      score: Number(((task.impact * task.urgency) / task.effort).toFixed(2)),
    }))
    .sort((left, right) => right.score - left.score)
    .map((task, index) => ({ rank: index + 1, ...task }));

  return { ranked };
}
