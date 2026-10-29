type ChecklistInput = { title: string; items: string[] };

export default async function createChecklist(parameters: ChecklistInput) {
  const title = parameters.title.trim().slice(0, 120);
  const items = parameters.items
    .map((label) => label.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 12)
    .map((label, index) => ({ position: index + 1, label, completed: false }));

  return { title, items, count: items.length };
}
