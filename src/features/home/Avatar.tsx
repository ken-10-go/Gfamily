import { avatarColor, avatarInitial } from '@/features/home/avatar';
import { displayName, type Person } from '@/types/models';

/** 丸いアバター。見た目の決め方は avatar.ts（家系図のカードと共通）。 */
export function Avatar({ person, size = 38 }: { person: Person; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      title={displayName(person)}
      style={{
        width: size,
        height: size,
        background: avatarColor(person.id),
        fontSize: Math.round(size * 0.36),
      }}
    >
      {avatarInitial(person)}
    </span>
  );
}
