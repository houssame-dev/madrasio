export function PeopleAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <span aria-hidden="true" className="pp-avatar">
      {[firstName, lastName].map((name) => Array.from(name.trim())[0] ?? '').join('')}
    </span>
  );
}
