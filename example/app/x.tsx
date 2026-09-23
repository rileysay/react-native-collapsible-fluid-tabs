import { useRouter } from 'expo-router';
import { ProfileScreen } from '../src/ProfileScreens';

export default function XDemo() {
  const router = useRouter();
  return <ProfileScreen variant="x" onBack={() => router.back()} />;
}
