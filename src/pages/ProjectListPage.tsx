import { Link } from 'react-router-dom';

export default function ProjectListPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-2 text-neutral-400">Saved projects will appear here once persistence lands in M1.</p>
      <Link to="/p/demo/setup" className="mt-4 inline-block rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">
        Open placeholder project
      </Link>
    </div>
  );
}
