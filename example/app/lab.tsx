import { useRouter } from 'expo-router';
import { LabScreen } from '../src/LabScreen';

export default function LabDemo() {
  const router = useRouter();
  return <LabScreen onBack={() => router.back()} />;
}
