function setBuildTimeFn(time, $selector) {
    let str = ""
    if (time == null) {
        str = "----------"
    } else {
        str = time.toString().slice(0, Math.min(time.toString().length, 6)) + " ms"
    }
    document.querySelector($selector).textContent = str
}