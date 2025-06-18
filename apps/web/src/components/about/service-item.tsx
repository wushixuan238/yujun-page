import type { LifeStyle } from "@/types/about";
import "@/styles/about/service-item.css";

interface ServiceItemProps {
  lifestyle: LifeStyle;
}

function ServiceItem({ lifestyle }: ServiceItemProps) {
  return (
    <li className="service-item dark:bg-border-gradient-onyx dark:shadow-shadow-2 relative rounded-2xl before:absolute before:content-[''] before:rounded-2xl">
      <div className="mb-2.5 sm:mb-0 sm:mt-2 flex justify-center items-center">
        <lifestyle.icon className="text-orange-yellow-crayola" size={24} />
      </div>

      <div className="text-center sm:text-left">
        <h4 className="dark:text-white-2 text-gray-900 text-lg font-bold mb-[7px]">
          {lifestyle.title}
        </h4>
        <p className="dark:text-light-gray text-gray-700 text-sm font-light leading-6">
          {lifestyle.text}
        </p>
      </div>
    </li>
  );
}

export default ServiceItem;
