// Декоративные иконки (без текста), порядок соответствует порядку карточек в messages.
function Icon({ paths }: { paths: string }) {
  return (
    <span className="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: paths }} />
    </span>
  );
}

const howItWorks = ["<path d=\"M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z\"/><path d=\"M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z\"/>",
  "<path d=\"M9 11l3 3 8-8\"/><path d=\"M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9\"/>",
  "<path d=\"M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9z\"/><circle cx=\"12\" cy=\"10\" r=\"1.5\"/><path d=\"M9 18l-2 3M15 18l2 3\"/>",
  "<path d=\"M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5L15 12l-3-3z\"/>"];

const benefits = ["<path d=\"M13 3L5 14h6l-1 7 8-11h-6z\"/>",
  "<path d=\"M12 3l9 5-9 5-9-5z\"/><path d=\"M3 13l9 5 9-5\"/>",
  "<path d=\"M9 11l3 3 8-8\"/><path d=\"M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9\"/>",
  "<path d=\"M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9.5 4 4 0 0 1 17 18z\"/>",
  "<path d=\"M4 5h16v11H9l-5 4z\"/>"];

const examples = ["<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 9h18\"/>",
  "<path d=\"M5 8h14l-1 12H6z\"/><path d=\"M9 8a3 3 0 0 1 6 0\"/>",
  "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M8 9h8M8 13h8M8 17h4\"/>",
  "<rect x=\"5\" y=\"8\" width=\"14\" height=\"11\" rx=\"3\"/><path d=\"M12 4v4M9 13h.01M15 13h.01\"/>",
  "<path d=\"M4 20V10M10 20V4M16 20v-8M22 20H2\"/>"];

export const HowItWorksIcon = ({ index }: { index: number }) => <Icon paths={howItWorks[index]} />;
export const BenefitIcon = ({ index }: { index: number }) => <Icon paths={benefits[index]} />;
export const ExampleIcon = ({ index }: { index: number }) => <Icon paths={examples[index]} />;
