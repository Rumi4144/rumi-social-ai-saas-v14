import {studioPageContext} from '@/lib/studio/page-context';
import StudioRecovery from '@/components/StudioRecovery';
import {labCanRun} from '@/lib/ai-lab/catalog';
import {AI_OPTIONS,optionReady} from '@/lib/ai-lab/options';
import OptionsCatalog from './OptionsCatalog';
export default async function AIOptions(){
 const {context,recovery}=await studioPageContext();if(recovery)return <StudioRecovery recovery={recovery}/>;
 if(!labCanRun(context.role,context.isSuperAdmin))return <section className="card"><h1>AI options</h1><p>Provider comparisons and prices are available only to the Rumi platform administrator.</p><a href="/studio">Open Creative Studio</a></section>;
 return <OptionsCatalog options={AI_OPTIONS} ready={AI_OPTIONS.filter(optionReady).map(option=>option.id)}/>;
}
