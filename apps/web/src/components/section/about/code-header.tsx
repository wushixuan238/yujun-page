import "@/styles/about/code-header.css";

interface CodeHeaderProps {
  id?: string;
  text: string;
}

function CodeHeader({ id, text }: CodeHeaderProps) {
  return (
    <h2
      id={id}
      className="code-header-clean dark:text-light-gray text-black text-lg font-bold mt-[30px] mb-[30px]"
    >
      <code className="dark:bg-transparent bg-white dark:border-none border-none">{text}</code>
    </h2>
  );
}

export default CodeHeader;
