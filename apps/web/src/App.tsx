import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@coursewise/shared';

function HomePage(): JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="text-muted-foreground">{t('app.tagline')}</p>
      <Button asChild>
        <Link to="/about">Learn more</Link>
      </Button>
    </main>
  );
}

function AboutPage(): JSX.Element {
  return (
    <main className="container py-12">
      <h2 className="text-2xl font-semibold">About</h2>
      <p className="mt-2 text-muted-foreground">
        CourseWise is a course management platform.
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/">Home</Link>
      </Button>
    </main>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
