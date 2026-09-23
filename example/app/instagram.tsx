import { useRouter } from 'expo-router';
import { ProfileScreen } from '../src/ProfileScreens';

export default function InstagramDemo() {
  const router = useRouter();
  return <ProfileScreen variant="instagram" onBack={() => router.back()} />;
}
