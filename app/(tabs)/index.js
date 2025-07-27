import { useFonts } from 'expo-font';

export default function Page() {
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      router.replace('/splash');
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return null;
}
