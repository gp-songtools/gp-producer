import AudioBriefPanel from '../components/setup/AudioBriefPanel';
import AudioPlayer from '../components/setup/AudioPlayer';
import LrcInput from '../components/setup/LrcInput';
import ReadyChecklist from '../components/setup/ReadyChecklist';
import RuntimeInput from '../components/setup/RuntimeInput';
import VisionForm from '../components/setup/VisionForm';

export default function SetupPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <LrcInput />
        <RuntimeInput />
        <AudioPlayer />
        <VisionForm />
        <AudioBriefPanel />
      </div>
      <ReadyChecklist />
    </div>
  );
}
