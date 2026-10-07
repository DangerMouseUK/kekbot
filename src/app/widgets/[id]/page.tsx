import Widget from "./widget";
export default async function WidgetPage({ params }: { params: Promise<{ id: string }> }) { return <Widget id={(await params).id} />; }
