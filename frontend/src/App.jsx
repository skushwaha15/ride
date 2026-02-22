import Home from "./components/home";
import MapPage from "./components/Mappage";

import {
Routes,
Route
} from "react-router-dom";

function App(){

return(

<Routes>

<Route path="/" element={<Home/>}/>

<Route path="/map" element={<MapPage/>}/>

</Routes>

);

}

export default App;
