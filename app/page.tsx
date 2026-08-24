import Dashboard from "@/components/dashboard";
import { toISO } from "@/lib/dates";
import { DEFAULT_DATA } from "@/lib/default-data";

export default function Page() {
  // Дата, с которой отрендерена статическая разметка. Клиент получает её как серверный
  // снимок, чтобы гидратация прошла без расхождений, а сразу после неё React заменит её
  // настоящей датой браузера. Без этого пропса клиент считал бы серверный снимок сам и
  // получал бы не то, что вшито в HTML.
  return <Dashboard initialData={DEFAULT_DATA} serverToday={toISO(new Date())} />;
}
