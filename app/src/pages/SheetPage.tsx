import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { storeFor } from '../lib/store';
import { CharacterList } from '../sheet/CharacterList';
import { LiveSheet } from '../sheet/LiveSheet';

export function SheetPage() {
  const { id } = useParams();
  const { loading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const store = useMemo(() => storeFor(userId), [userId]);

  if (loading) return <p>Checking who is aboard…</p>;
  // Remounting on a different character or account keeps one sheet's state out of another's.
  return id ? <LiveSheet key={`${userId}/${id}`} store={store} id={id} /> : <CharacterList key={userId} store={store} />;
}
