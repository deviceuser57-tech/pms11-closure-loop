import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ShieldCheck, Workflow, Layers3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/user-guide")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "User Guide — PMS 11 Closure Loop" }, { name: "description", content: "Bilingual guide to PMS 11 closure loop concepts: work packages, rules, evidence, acceptance and gates." }] }),
  component: UserGuide,
});

const elements = [
  ["WPS — Work Package / حزمة العمل", "الوحدة الرئيسية للتخطيط والتنفيذ والإغلاق في PMS-11. كل WPS يجمع القواعد والأنشطة والمهام والأدلة والفجوات ومعايير القبول المرتبطة بنطاق عمل محدد.", "مثال: WPS-01 Class & Identity."],
  ["Rule — قاعدة / متطلب حاكم", "قاعدة أو متطلب يجب التحقق من انطباقه وتنفيذه. الـ Rule لا تعني أن المتطلب أُنجز؛ بل تحدد ما الذي يجب إثباته.", "مثال: R-001."],
  ["Activity — نشاط", "وحدة عمل أعلى من Task تصف خطوة تشغيلية أو تحققاً مطلوباً لإغلاق Rule أو WPS أو متطلب آخر.", "مثال: A-R-001."],
  ["Task — مهمة", "خطوة تنفيذية محددة داخل Activity، يفترض أن يكون لها تنفيذ مسجل ومالك وأدلة إتمام عند الحاجة.", "مثال: T-R-001-02."],
  ["Deliverable — مُخرج / تسليم", "الوثيقة أو النتيجة أو المنتج الذي يجب أن ينتج عن تنفيذ نشاط أو حزمة عمل، ويمكن ربطه بالأدلة ومعايير القبول.", "مثال: تقرير أو شهادة أو سجل اختبار مطلوب ضمن WPS."],
  ["Evidence — دليل إثبات", "المستند أو السجل أو الشهادة أو صورة/تقرير الاختبار الذي يثبت تنفيذ أو تحقق متطلب. وجود Evidence لا يعني تلقائياً أن المتطلب مقبول؛ يجب مراجعته مقابل معيار القبول.", "مثال: E-096."],
  ["Acceptance — معيار قبول", "المعيار الذي يحدد متى يعتبر المتطلب أو المخرج مستوفياً. حالة التنفيذ وحدها لا تكفي للإغلاق إذا لم يتحقق معيار القبول.", "مثال: AC-R-001."],
  ["Gap — فجوة / ملاحظة عدم إغلاق", "نقطة نقص أو عدم توافق أو نقص في الإثبات تمنع الإغلاق أو تحتاج إجراءً تصحيحياً. تُستخدم مع CAPA لمتابعة الإجراء حتى الإغلاق.", "مثال: G-001."],
  ["CAPA — إجراء تصحيحي ووقائي", "منهج لمعالجة سبب الفجوة أو عدم المطابقة، مع تحديد الإجراء والمالك والدليل المطلوب للتحقق من الإغلاق. في التطبيق تظهر الفجوات ضمن Findings & CAPA.", "يرتبط عادةً بـ Gap وليس بديلاً عن Evidence."],
  ["Gate — بوابة قرار", "نقطة تحكم مرحلية تقرر هل يمكن الانتقال إلى المرحلة التالية. وجود No-Go يمنع الإغلاق أو الانتقال حتى تتم معالجة سبب المنع.", "مثال: Gate 0–8."],
  ["Responsibility / RACI — المسؤوليات", "سجل يحدد من ينفذ أو يملك أو يراجع أو يُستشار أو يُبلّغ بشأن العمل. الهدف منع وجود نشاط أو مهمة بلا مسؤول واضح.", "RACI = Responsible, Accountable, Consulted, Informed."],
  ["Risk — خطر", "حدث أو حالة محتملة قد تؤثر على السلامة أو الجدول أو التكلفة أو الامتثال أو جاهزية PMS-11، ويجب تقييمها ومعالجتها ومراقبتها.", "مثال: Risk مرتبط بـ WPS أو Rule."],
  ["Change — تغيير", "طلب أو سجل تغيير يؤثر على نطاق أو طريقة تنفيذ أو متطلب أو وثيقة أو قرار. يجب أن يكون التغيير قابلاً للتتبع والمراجعة.", "يُستخدم في Change Register."],
  ["Equipment — معدة", "معدة أو نظام أو أصل تشغيلي يحتاج إلى حالة فنية، صيانة/اختبارات وشهادات أو أدلة مناسبة قبل اعتماده للاستخدام.", "مثال: HMC 5500 أو Link-Belt LS 718."],
  ["Department — الإدارة المسؤولة", "النطاق التنظيمي الذي يرى أو يدير السجلات وفق صلاحيات التطبيق. الـ Admin يرى الجميع، بينما المستخدم العادي يعمل ضمن نطاق إدارته.", "لا تُخمن الإدارة؛ تُعيّن من القائمة المعتمدة."],
  ["Owner — المسؤول عن الإغلاق", "الشخص أو الجهة المسؤولة فعلياً عن تنفيذ ومتابعة السجل حتى إغلاقه. وجود اسم Owner وحده لا يعني أن العمل تم.", "يجب أن يكون المالك حقيقياً وقابلاً للمساءلة."],
  ["Status — الحالة", "الحالة التشغيلية الحالية للسجل مثل Not Started أو In Progress أو Closed وفق القيم المحكومة في النظام. لا تستخدم الحالة لإخفاء نقص الأدلة.", "الإغلاق يتطلب استيفاء شروط الإغلاق وليس مجرد اختيار Closed."],
  ["Criticality — الأهمية/الحرجية", "درجة أهمية السجل وتأثيره على السلامة أو الامتثال أو الجاهزية. تساعد في ترتيب الأولويات ولا تعني وحدها أن السجل متأخر أو غير ممتثل.", "تُستخدم لتحديد ما يحتاج اهتماماً أسرع."],
  ["Review — المراجعة", "عملية فحص السجل أو الدليل مقابل المتطلبات ومعايير القبول. المراجعة المعتمدة جزء من حلقة الإغلاق.", "لا تعتبر المراجعة موافقة تلقائية على المحتوى."],
  ["Closure — الإغلاق", "حالة لا يصل إليها السجل إلا بعد وجود مالك، وتنفيذ مسجل، ودليل صالح، ومراجعة مستوفاة، ومعيار قبول محقق، وعدم وجود No-Go مؤثر.", "Closed = إغلاق مثبت، وليس مجرد تغيير Status."],
  ["Closure Loop — حلقة الإغلاق", "السلسلة التي تربط المتطلب بالتنفيذ ثم الدليل ثم المراجعة ثم القبول ثم قرار الإغلاق. الهدف أن يكون لكل ادعاء قابل للمراجعة مسار إثبات واضح.", "Rule/WPS → Activity/Task → Evidence → Review/Acceptance → Closure."],
];

function UserGuide() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => {
    const key = window.location.hash.replace("#", "");
    if (!key) return;
    setActiveKey(key);
    window.setTimeout(() => document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    const onHash = () => setActiveKey(window.location.hash.replace("#", "") || null);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const backTo = (key: string) => ({ wps: "/r/wps", rule: "/r/rule", activity: "/r/activity", task: "/r/task", deliverable: "/r/deliverable", evidence: "/r/evidence", acceptance: "/r/acceptance", gap: "/r/gap", gate: "/r/gate", responsibility: "/r/responsibility", risk: "/r/risk", change: "/r/change", equipment: "/r/equipment" } as Record<string,string>)[key] ?? "/dashboard";
  const elementKey = (name: string) => name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  return <div className="mx-auto max-w-6xl space-y-6">
    <header><p className="label-caps">PMS 11 · User Guide</p><h1 className="font-display text-4xl font-semibold">دليل استخدام PMS-11 Closure Loop</h1><p className="mt-2 text-sm text-muted-foreground">تعريف كل عنصر رئيسي في النظام، وظيفته، وعلاقته بحلقة الإغلاق.</p><p className="mt-2 text-xs text-muted-foreground">اضغط على اسم أي عنصر للعودة مباشرة إلى صفحته. وعند فتح الدليل من زر Help سيتم تمييز العنصر المطلوب تلقائياً.</p></header>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="maritime-card p-5"><BookOpen className="mb-3 h-5 w-5 text-primary"/><h2 className="font-semibold">الإضافة</h2><p className="mt-2 text-sm text-muted-foreground">أنشئ السجل من الـ Register المناسب واستخدم القيم المحكومة للإدارة والمالك والحالة والحرجية.</p></div>
      <div className="maritime-card p-5"><Workflow className="mb-3 h-5 w-5 text-primary"/><h2 className="font-semibold">التنفيذ والتتبع</h2><p className="mt-2 text-sm text-muted-foreground">اربط Activity وTask وEvidence وAcceptance بالعلاقات الفعلية من المصدر، ولا تنشئ علاقة غير مدعومة.</p></div>
      <div className="maritime-card p-5"><CheckCircle2 className="mb-3 h-5 w-5 text-primary"/><h2 className="font-semibold">الإغلاق</h2><p className="mt-2 text-sm text-muted-foreground">الإغلاق يتطلب Owner وتنفيذاً مسجلاً ودليلاً صالحاً ومراجعة ومعيار قبول مستوفى وعدم وجود No-Go مؤثر.</p></div>
    </div>
    <section className="maritime-card p-6 space-y-4">
      <div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary"/><h2 className="font-display text-2xl">تعريف عناصر النظام</h2></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">العنصر</th><th className="p-3">التعريف والوظيفة</th><th className="p-3">مثال / ملاحظة</th></tr></thead><tbody>{elements.map(([name,def,example]) => { const key = elementKey(name); const href = backTo(key); const active = activeKey === key; return <tr key={name} id={key} className={`border-b align-top transition-all ${active ? "bg-primary/10 ring-2 ring-primary/50 shadow-md" : ""}`}><td className="p-3 font-semibold whitespace-nowrap"><a href={href} className="text-primary underline decoration-dotted underline-offset-4" title="العودة إلى الصفحة الخاصة بهذا العنصر">{name}</a></td><td className={`p-3 text-muted-foreground ${active ? "font-medium text-foreground" : ""}`}>{def}</td><td className="p-3 text-muted-foreground">{example}</td></tr>; })}</tbody></table></div>
    </section>
    <section className="maritime-card p-6 space-y-4"><h2 className="font-display text-2xl">سير العمل القياسي</h2><ol className="list-decimal space-y-2 pl-5 text-sm"><li>ابدأ من WPS أو Rule أو Gap أو Gate حسب نطاق العمل.</li><li>حدد Activity ثم Tasks التي تنفذ النشاط، إذا كانت موجودة في المصدر.</li><li>سجل التنفيذ الفعلي واربط Evidence المناسب.</li><li>راجع الدليل مقابل Acceptance Criteria.</li><li>إذا وجدت نقصاً، افتح أو حدّث Gap/CAPA ولا تعتبر الحالة Closed.</li><li>نفذ Closure Check قبل الإغلاق وتأكد من عدم وجود No-Go مؤثر.</li></ol></section>
    <section className="maritime-card p-6 space-y-3"><h2 className="font-display text-2xl">الإدارة والصلاحيات</h2><p className="text-sm text-muted-foreground">الـ Admin يرى جميع الإدارات. المستخدم غير الإداري يرى السجلات ضمن Department المخصص له. تغييرات الأدوار والصلاحيات الإدارية محكومة ولا تُمنح من واجهة المستخدم العادية.</p><Link to="/admin/users" className="inline-flex items-center gap-2 text-primary underline"><ShieldCheck className="h-4 w-4"/>فتح لوحة الإدارة</Link></section>
  </div>;
}
