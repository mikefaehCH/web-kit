export function renderSections(root, site, { scope } = {}) {
  root.querySelector('#title').textContent = site.title;
  root.querySelector('#description').textContent = site.description;
  const navigation = root.querySelector('#section-navigation');
  const sections = root.querySelector('#sections');
  const hybrid = site.mode === 'hybrid';
  const showNavigation = site.content.sections.length > 1 || hybrid;
  for (const [index, item] of site.content.sections.entries()) {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    const paragraph = document.createElement('p');
    section.id = 'abschnitt-' + (index + 1);
    section.tabIndex = -1;
    if (showNavigation) {
      const link = document.createElement('a');
      link.href = '#' + section.id;
      link.textContent = item.heading;
      navigation.append(link);
    }
    heading.textContent = item.heading;
    paragraph.textContent = item.text;
    section.append(heading, paragraph);
    sections.append(section);
  }
  if (hybrid) {
    const link = document.createElement('a');
    link.href = '#planner';
    link.textContent = 'Mein Planer';
    navigation.append(link);
  }
  navigation.hidden = !showNavigation;
  if (site.mode) {
    const planner = root.querySelector('#planner');
    planner.hidden = false;
    return import('./planner.js')
      .then(({ mountPlanner }) => mountPlanner(planner, site.id, { fields: site.plannerFields, scope }))
      .catch(() => {
        planner.querySelector('#planner-status').textContent = 'Der Planer konnte nicht geladen werden.';
      });
  }
}
