
//

const Capitalize = (a: string) => {
    //check type of a
    if (typeof a !== "string") {
        return;
    }
    return a.split("")[0].toUpperCase() + a.slice(1) //
}

export default Capitalize;