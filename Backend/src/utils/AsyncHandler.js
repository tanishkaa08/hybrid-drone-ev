const asyncHandler = (requestHandler) => {
    return (req,res,next) => {
        Promise.resolve(requestHandler(req, res, next))
            .catch((error) => {
           res.status( 500).json({
                success: false,
                message: error.message || 'Internal Server Error',
            });
            next(error);     
    });
    }
}

export default asyncHandler;